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
