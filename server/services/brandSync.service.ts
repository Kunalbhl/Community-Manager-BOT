/**
 * Keeps the Discord bot's profile photo and app icon the same as the website logo.
 * Runs once per logo version on the active bot (Discord rate-limits avatar changes, so never on every start).
 */
import { logger } from '../logging/logger.js';
import { FirestoreRepository } from '../repositories/firestore.repository.js';
import { discordService } from '../integrations/discord/discord.service.js';

const LOGO_VERSION = '2026-11-brand-hexagon';
const flags = new FirestoreRepository<{ id: string; version: string; at: string }>('platformFlags');

export async function syncBrandToDiscord() {
  try {
    const done = await flags.getById('discordBrand').catch(() => null);
    if (done?.version === LOGO_VERSION) return;
    const base = (process.env.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '');
    const res = await fetch(`${base}/logo-1024.png`);
    if (!res.ok) throw new Error(`logo not reachable (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const client: any = (discordService as any).client;
    if (!client?.user) throw new Error('bot not ready');
    await client.user.setAvatar(buf);
    // App icon (shown in the app directory and on the install screen).
    await client.rest.patch('/applications/@me', { body: { icon: `data:image/png;base64,${buf.toString('base64')}` } }).catch((e: any) => logger.warn(`[Brand] app icon not updated: ${e?.message}`));
    const data = { id: 'discordBrand', version: LOGO_VERSION, at: new Date().toISOString() };
    if (done) await flags.update('discordBrand', data as any); else await flags.create('discordBrand', data as any);
    logger.info('[Brand] Discord bot avatar and app icon updated to the website logo.');
  } catch (err: any) {
    logger.warn(`[Brand] sync skipped: ${err?.message}`);
  }
}
