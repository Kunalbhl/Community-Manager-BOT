import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../logging/logger.js';

/**
 * Makes sure the bot itself can post in a channel, without touching anyone else's permissions.
 * The server's own settings are respected: if the bot is missing something, it adds an overwrite for
 * ITS OWN member only (never @everyone, never another role). @everyone/@here pings need Mention Everyone,
 * which is added for the bot only when the message actually contains them.
 * Returns '' when ready, or a plain explanation of what is still missing.
 */
export async function ensureSelfAccess(channel: any, content = ''): Promise<string> {
  try {
    const guild = channel?.guild;
    const me = guild?.members?.me;
    if (!guild || !me || !channel.permissionsFor) return '';
    const P = PermissionFlagsBits;
    const need: bigint[] = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory];
    if (channel.isThread?.()) need.push(P.SendMessagesInThreads);
    if (/@everyone|@here/.test(content)) need.push(P.MentionEveryone);
    const have = channel.permissionsFor(me);
    const missing = need.filter((p) => !have?.has(p));
    if (!missing.length) return '';
    const target = channel.isThread?.() ? channel.parent : channel;
    if (!target?.permissionOverwrites) return 'The bot can’t post there and can’t fix it inside a thread.';
    if (!me.permissions.has(P.ManageRoles) && !me.permissions.has(P.Administrator)) {
      return 'The bot is missing permissions in that channel and needs Manage Roles (server-wide) to give itself access.';
    }
    const allow: Record<string, boolean> = {};
    const names: Record<string, string> = { [String(P.ViewChannel)]: 'ViewChannel', [String(P.SendMessages)]: 'SendMessages', [String(P.EmbedLinks)]: 'EmbedLinks', [String(P.AttachFiles)]: 'AttachFiles', [String(P.ReadMessageHistory)]: 'ReadMessageHistory', [String(P.SendMessagesInThreads)]: 'SendMessagesInThreads', [String(P.MentionEveryone)]: 'MentionEveryone' };
    for (const p of missing) allow[names[String(p)]] = true;
    // Overwrite for the bot's own member only.
    await target.permissionOverwrites.edit(me.id, allow, { reason: 'Community Manager: give the bot access it needs to post here (only the bot is affected)' });
    logger.info(`[SelfAccess] Gave the bot ${Object.keys(allow).join(', ')} in #${target.name}`);
    const still = need.filter((p) => !channel.permissionsFor(me)?.has(p));
    return still.length ? 'The bot still can’t post there. A higher role or the channel denies it; ask an admin to allow the bot in that channel.' : '';
  } catch (err: any) {
    return `The bot couldn’t give itself access in that channel (${err?.message || err}). Ask an admin to allow the bot there.`;
  }
}

const NAMES: Record<string, string> = Object.fromEntries(Object.entries(PermissionFlagsBits).map(([k, v]) => [String(v), k]));

/**
 * Same idea for any feature: give the bot (only the bot) the channel permissions this feature needs,
 * e.g. Manage Channels to rename a stats counter. Never touches @everyone or other roles.
 */
export async function ensureSelfPerms(channel: any, perms: bigint[], why = 'run this feature'): Promise<string> {
  try {
    const me = channel?.guild?.members?.me;
    if (!me || !channel.permissionsFor) return '';
    const missing = perms.filter((p) => !channel.permissionsFor(me)?.has(p));
    if (!missing.length) return '';
    const target = channel.isThread?.() ? channel.parent : channel;
    if (!target?.permissionOverwrites) return 'The bot can’t change permissions here.';
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles) && !me.permissions.has(PermissionFlagsBits.Administrator)) return explainAccess(channel, perms);
    // A channel permission the bot doesn't have server-wide can't be granted by itself; Discord refuses that.
    const grantable = missing.filter((p) => me.permissions.has(p) || p === PermissionFlagsBits.ViewChannel || p === PermissionFlagsBits.SendMessages || p === PermissionFlagsBits.Connect);
    if (!grantable.length) return explainAccess(channel, perms);
    await target.permissionOverwrites.edit(me.id, Object.fromEntries(grantable.map((p) => [NAMES[String(p)], true])), { reason: `Community Manager: give the bot what it needs to ${why} (only the bot is affected)` });
    logger.info(`[SelfAccess] Gave the bot ${grantable.map((p) => NAMES[String(p)]).join(', ')} in #${target.name} to ${why}`);
    const still = perms.filter((p) => !channel.permissionsFor(me)?.has(p));
    return still.length ? explainAccess(channel, perms) : '';
  } catch (err: any) {
    return explainAccess(channel, perms) || `The bot couldn’t give itself access here (${err?.message || err}).`;
  }
}

let patched = false;
/**
 * Every message the bot posts (panels, logs, boards, rosters, approvals ...) first makes sure the bot
 * itself may post in that channel, adding an overwrite for the bot only when something is missing.
 */
export function patchSendWithSelfAccess(djs: any) {
  if (patched) return;
  patched = true;
  const classes = [djs.TextChannel, djs.NewsChannel, djs.VoiceChannel, djs.StageChannel, djs.ThreadChannel].filter(Boolean);
  for (const C of classes) {
    const orig = C.prototype.send;
    if (!orig || orig.__cmSelf) continue;
    const wrapped = async function (this: any, options: any) {
      try {
        const me = this.guild?.members?.me;
        const P = PermissionFlagsBits;
        const ok = me && this.permissionsFor?.(me)?.has([P.ViewChannel, this.isThread?.() ? P.SendMessagesInThreads : P.SendMessages, P.EmbedLinks]);
        if (me && !ok) await ensureSelfAccess(this, typeof options === 'string' ? options : String(options?.content || ''));
      } catch { /* never block the send */ }
      return orig.call(this, options);
    };
    (wrapped as any).__cmSelf = true;
    C.prototype.send = wrapped;
  }
}

const LABEL: Record<string, string> = {
  ViewChannel: 'View Channel', ManageChannels: 'Manage Channels', Connect: 'Connect', SendMessages: 'Send Messages', EmbedLinks: 'Embed Links',
  AttachFiles: 'Attach Files', ReadMessageHistory: 'Read Message History', ManageRoles: 'Manage Roles', CreateInstantInvite: 'Create Invite',
  MentionEveryone: 'Mention @everyone', SendMessagesInThreads: 'Send Messages in Threads', ManageMessages: 'Manage Messages', ManageEvents: 'Manage Events',
};
const label = (p: bigint) => LABEL[NAMES[String(p)]] || NAMES[String(p)];

/**
 * Exactly what blocks the bot in this channel and what the admin should change, in plain words.
 * Empty string when nothing is missing.
 */
export function explainAccess(channel: any, perms: bigint[]): string {
  try {
    const guild = channel?.guild;
    const me = guild?.members?.me;
    if (!me || !channel?.permissionsFor) return '';
    const P = PermissionFlagsBits;
    const missing = perms.filter((p) => !channel.permissionsFor(me)?.has(p));
    if (!missing.length) return '';
    const botRole = me.roles?.botRole?.name || me.roles?.highest?.name || 'the bot’s role';
    const where = channel.parent ? `#${channel.name} (in category ${channel.parent.name})` : `#${channel.name}`;
    // Which overwrite denies it: the channel's own, else the category's.
    const denies: string[] = [];
    for (const src of [channel, channel.parent].filter(Boolean)) {
      for (const o of src.permissionOverwrites?.cache?.values?.() || []) {
        const applies = o.id === me.id || o.id === guild.roles.everyone.id || me.roles.cache.has(o.id);
        if (!applies) continue;
        const d = missing.filter((p) => o.deny?.has?.(p));
        if (d.length) denies.push(`${o.id === guild.roles.everyone.id ? '@everyone' : o.id === me.id ? 'the bot' : '@' + (guild.roles.cache.get(o.id)?.name || 'a role')} is denied ${d.map(label).join(', ')} on ${src === channel ? '#' + src.name : 'category ' + src.name}`);
      }
    }
    const serverWide = missing.filter((p) => p !== P.ViewChannel && p !== P.Connect && p !== P.SendMessages && !me.permissions.has(p));
    const parts = [`The bot is missing ${missing.map(label).join(', ')} in ${where}.`];
    if (denies.length) parts.push(`Why: ${denies.slice(0, 3).join('; ')}.`);
    if (serverWide.length) parts.push(`Fix 1: Server Settings → Roles → ${botRole} → turn on ${serverWide.map(label).join(', ')}.`);
    parts.push(`${serverWide.length ? 'Fix 2' : 'Fix'}: Edit ${channel.parent ? `category ${channel.parent.name}` : `#${channel.name}`} → Permissions → add role ${botRole} → allow ${missing.map(label).join(', ')}.`);
    if (!missing.includes(P.ViewChannel) && me.permissions.has(P.ManageRoles)) parts.push('(The bot will then keep this up by itself.)');
    else parts.push('Discord does not let a bot change a channel it cannot see, even with Manage Roles; only Administrator skips this.');
    return parts.join(' ');
  } catch { return ''; }
}
