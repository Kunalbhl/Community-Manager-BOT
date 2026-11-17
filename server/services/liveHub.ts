/**
 * Live dashboard: when something changes in a Discord server (a channel, role, member name, emoji
 * or the server itself), every open dashboard for that server is told within about a second over
 * Server-Sent Events, so it reloads just that data without a browser refresh.
 */
import type { Response } from 'express';

const KINDS: Record<string, string> = {
  CHANNEL_CREATE: 'channels', CHANNEL_UPDATE: 'channels', CHANNEL_DELETE: 'channels',
  GUILD_ROLE_CREATE: 'roles', GUILD_ROLE_UPDATE: 'roles', GUILD_ROLE_DELETE: 'roles',
  GUILD_MEMBER_ADD: 'members', GUILD_MEMBER_UPDATE: 'members', GUILD_MEMBER_REMOVE: 'members',
  GUILD_UPDATE: 'guild', GUILD_EMOJIS_UPDATE: 'emojis',
};

const subs = new Map<string, Set<Response>>();
const pending = new Map<string, { kinds: Set<string>; timer: NodeJS.Timeout }>();

function send(guildId: string, kinds: string[]) {
  const set = subs.get(guildId);
  if (!set?.size) return;
  const msg = `event: change\ndata: ${JSON.stringify({ kinds, at: Date.now() })}\n\n`;
  for (const res of set) { try { res.write(msg); } catch { set.delete(res); } }
}

export const liveHub = {
  /** Called for every gateway packet; cheap when nobody is watching that server. */
  onRaw(packet: any) {
    const kind = KINDS[packet?.t];
    const guildId = packet?.d?.guild_id || (packet?.t === 'GUILD_UPDATE' ? packet?.d?.id : undefined);
    if (!kind || !guildId || !subs.get(guildId)?.size) return;
    this.notify(guildId, kind);
  },

  /** Batches bursts (e.g. a bulk role edit) into one message per ~0.8 s. */
  notify(guildId: string, kind: string) {
    const p = pending.get(guildId);
    if (p) { p.kinds.add(kind); return; }
    const kinds = new Set([kind]);
    pending.set(guildId, { kinds, timer: setTimeout(() => { pending.delete(guildId); send(guildId, Array.from(kinds)); }, 800) });
  },

  subscribe(guildId: string, res: Response) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\nevent: ready\ndata: {}\n\n`);
    if (!subs.has(guildId)) subs.set(guildId, new Set());
    subs.get(guildId)!.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 25_000);
    // Cloud Run ends requests after its timeout; the browser reconnects on its own.
    const end = setTimeout(() => { try { res.end(); } catch { /* closed */ } }, 50 * 60_000);
    res.on('close', () => { clearInterval(ping); clearTimeout(end); subs.get(guildId)?.delete(res); });
  },
};
