/** Send a bot embed once; if the bot already posted one like it in the channel, edit that message instead of adding another. */
export async function upsertBotEmbed(channel: any, botId: string | undefined, embed: any, isMine: (m: any) => boolean, opts: { pin?: boolean; scan?: number } = {}): Promise<'posted' | 'updated'> {
  if (!channel?.send) throw new Error('no channel');
  let found: any;
  try {
    const pinned: any[] = Array.from(((await channel.messages.fetchPinned().catch(() => new Map())) as Map<string, any>).values());
    const recent: any[] = Array.from(((await channel.messages.fetch({ limit: opts.scan ?? 50 }).catch(() => new Map())) as Map<string, any>).values());
    found = [...pinned, ...recent].find((m: any) => m.author?.id === botId && m.embeds?.length && isMine(m));
  } catch { /* fall through to posting */ }
  if (found) { await found.edit({ embeds: [embed], allowedMentions: { parse: [] } }); return 'updated'; }
  const msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  if (opts.pin) await msg.pin().catch(() => undefined);
  return 'posted';
}
