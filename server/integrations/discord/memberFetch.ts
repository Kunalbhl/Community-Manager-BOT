/**
 * Every member of a guild without hitting Discord's gateway "Request Guild Members" limit (opcode 8).
 * guild.members.fetch() uses that gateway request, which Discord rate limits per guild; several jobs asking
 * at once (bulk tools, stats, reports, Secure Setup) then fail with "opcode 8 was rate limited".
 * So: use the cache when it is complete, otherwise page through the REST endpoint (separate, much higher limit).
 */
const COMPLETE = 0.98;

export async function allMembers(guild: any): Promise<Map<string, any>> {
  const total = Number(guild.memberCount) || 0;
  if (total && guild.members.cache.size >= Math.floor(total * COMPLETE)) return guild.members.cache;
  try {
    let after: string | undefined;
    for (let page = 0; page < 200; page++) { // up to 200k members
      const batch: Map<string, any> = await guild.members.list({ limit: 1000, after, cache: true });
      if (!batch?.size) break;
      after = Array.from(batch.keys()).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)).pop();
      if (batch.size < 1000) break;
    }
  } catch {
    // REST unavailable: last resort is the gateway request, once.
    return guild.members.fetch();
  }
  return guild.members.cache;
}
