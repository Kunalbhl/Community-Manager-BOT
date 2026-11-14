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
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles) && !me.permissions.has(PermissionFlagsBits.Administrator)) return 'The bot needs Manage Roles (server-wide) to give itself access in this channel.';
    // A channel permission the bot doesn't have server-wide can't be granted by itself; Discord refuses that.
    const grantable = missing.filter((p) => me.permissions.has(p) || p === PermissionFlagsBits.ViewChannel || p === PermissionFlagsBits.SendMessages || p === PermissionFlagsBits.Connect);
    if (!grantable.length) return `The bot's role needs ${missing.map((p) => NAMES[String(p)]).join(', ')} in Server Settings → Roles.`;
    await target.permissionOverwrites.edit(me.id, Object.fromEntries(grantable.map((p) => [NAMES[String(p)], true])), { reason: `Community Manager: give the bot what it needs to ${why} (only the bot is affected)` });
    logger.info(`[SelfAccess] Gave the bot ${grantable.map((p) => NAMES[String(p)]).join(', ')} in #${target.name} to ${why}`);
    const still = perms.filter((p) => !channel.permissionsFor(me)?.has(p));
    return still.length ? `The bot still lacks ${still.map((p) => NAMES[String(p)]).join(', ')} here; a higher setting blocks it.` : '';
  } catch (err: any) {
    return `The bot couldn’t give itself access here (${err?.message || err}).`;
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
