/**
 * Loading every member of a server goes through Discord's gateway "Request Guild Members" call (opcode 8),
 * which Discord rate-limits hard (one full request per server about every 30 seconds). Calling it from
 * several places, or repeatedly, produces "Request with opcode 8 was rate limited".
 *
 * getAllMembers() avoids that: it reuses the cache when it is already complete, shares one in-flight
 * request per server, waits out a rate limit and retries, and falls back to whatever is cached.
 */
const inflight = new Map<string, Promise<any>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function retryAfterMs(err: any): number | null {
  const a = err?.data?.retry_after ?? err?.retryAfter;
  if (typeof a === 'number' && a > 0) return Math.ceil(a * 1000);
  const m = String(err?.message || '').match(/rate limited.*?retry after ([0-9.]+) ?s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

const cacheComplete = (guild: any) => guild.members.cache.size >= Math.max(1, (guild.memberCount || 0) - 1);

export async function getAllMembers(guild: any, opts: { maxWaitMs?: number } = {}): Promise<Map<string, any>> {
  if (cacheComplete(guild)) return guild.members.cache;
  const key = guild.id;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const maxWait = opts.maxWaitMs ?? 90_000;
    let waited = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await guild.members.fetch(); }
      catch (e: any) {
        const wait = retryAfterMs(e);
        if (wait === null || waited + wait > maxWait) break;
        waited += wait + 1000;
        await sleep(wait + 1000);
        if (cacheComplete(guild)) return guild.members.cache;
      }
    }
    if (guild.members.cache.size) return guild.members.cache; // rate-limited: use the members already known
    throw new Error('Discord is limiting how fast member lists can be loaded. Try again in a minute.');
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
