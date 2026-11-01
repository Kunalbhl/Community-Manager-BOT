/**
 * Public "Contact us" data + form.
 *
 *  GET  /api/v1/public/contact  -> live info about the developer's Discord server, a never-expiring invite
 *                                  to the "Development Area & Feedback" channel, and the developer profile.
 *  POST /api/v1/public/contact  -> posts a contact / collaboration message into that server for discussion.
 *
 * The form is rate-limited per IP, size-limited, has a honeypot field, and the bot posts with all
 * mentions disabled so nobody can ping @everyone through it.
 */
import type { Request, Response } from 'express';
import { discordService } from '../integrations/discord/discord.service.js';
import { logger } from '../logging/logger.js';

const GUILD_ID = () => (process.env.CONTACT_GUILD_ID || '461134823000506368').trim();
const OWNER_ID = () => (process.env.OWNER_DISCORD_ID || '436486741080408064').trim();
const AREA_RE = /develop|feedback/i;
const FORM_RE = /feedback|collab|business|contact|suggest/i;

let cache: { at: number; data: any } | null = null;
const TTL = 10 * 60 * 1000;

function textChannels(guild: any): any[] {
  return Array.from(guild.channels.cache.values()).filter((c: any) => c.type === 0).sort((a: any, b: any) => a.rawPosition - b.rawPosition);
}

/** Finds the Development Area & Feedback channels (a category, or channels named like it). */
function findChannels(guild: any): { invite: any | null; form: any | null } {
  const all = textChannels(guild);
  const category: any = Array.from(guild.channels.cache.values()).find((c: any) => c.type === 4 && AREA_RE.test(c.name));
  const area = category ? all.filter((c: any) => c.parentId === category.id) : all.filter((c: any) => AREA_RE.test(c.name));
  const invite = area[0] || null;
  const form = area.find((c: any) => FORM_RE.test(c.name)) || invite;
  return { invite, form };
}

async function build(): Promise<any> {
  const client: any = discordService.client;
  const out: any = { guild: null, invite: null, owner: null };
  if (!client || !discordService.isConnected()) return out;

  const guild: any = client.guilds.cache.get(GUILD_ID()) || (await client.guilds.fetch(GUILD_ID()).catch(() => null));
  if (guild) {
    out.guild = {
      name: guild.name,
      icon: guild.iconURL?.({ size: 256 }) || null,
      banner: guild.bannerURL?.({ size: 1024 }) || null,
      description: guild.description || null,
      createdAt: guild.createdAt?.toISOString?.() || null,
      boostLevel: guild.premiumTier || 0,
      boosts: guild.premiumSubscriptionCount || 0,
    };
    const { invite } = findChannels(guild);
    if (invite) {
      try {
        const inv = await invite.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'Website contact link (never expires)' });
        out.invite = `https://discord.gg/${inv.code}`;
        out.inviteChannel = invite.name;
      } catch (err: any) {
        logger.warn(`[Contact] Could not create invite: ${err?.message}`);
      }
    }
  }

  const owner: any = await client.users.fetch(OWNER_ID()).catch(() => null);
  if (owner) {
    out.owner = { id: owner.id, username: owner.username, displayName: owner.globalName || owner.username, avatar: owner.displayAvatarURL?.({ size: 256 }) || null };
  }

  return out;
}

export async function getPublicContact(_req: Request, res: Response) {
  try {
    if (!cache || Date.now() - cache.at > TTL || !cache.data.guild) cache = { at: Date.now(), data: await build() };
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, data: cache.data });
  } catch (err: any) {
    logger.warn(`[Contact] info failed: ${err?.message}`);
    res.json({ success: true, data: { guild: null, invite: null, owner: null, stats: null } });
  }
}

// ---------- form ----------
const hits = new Map<string, number[]>();
const LIMIT = 3;
const WINDOW = 60 * 60 * 1000;
const TOPICS = ['Business', 'Collaboration', 'Feedback', 'Bug report', 'Support', 'Other'];

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
const noPing = (s: string) => s.replace(/@/g, '@​');

export async function postPublicContact(req: Request, res: Response) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) return res.status(429).json({ success: false, error: { message: 'Too many messages. Please try again in an hour.' } });

  const b = req.body || {};
  if (b.website) return res.json({ success: true }); // honeypot: bots fill hidden fields
  const name = clean(b.name, 80);
  const contact = clean(b.contact, 120);
  const topic = TOPICS.includes(b.topic) ? b.topic : 'Other';
  const message = clean(b.message, 1500);
  if (name.length < 2 || contact.length < 2 || message.length < 10) {
    return res.status(400).json({ success: false, error: { message: 'Please fill in your name, a way to reach you, and a message of at least 10 characters.' } });
  }

  const client: any = discordService.client;
  const guild: any = client?.guilds?.cache?.get(GUILD_ID());
  const channel = guild ? findChannels(guild).form : null;
  if (!channel) return res.status(503).json({ success: false, error: { message: 'The contact channel is not reachable right now. Please join our Discord instead.' } });

  try {
    await channel.send({
      allowedMentions: { parse: [] },
      embeds: [{
        title: noPing(`📨 ${topic} enquiry from the website`),
        color: 0xff5c8a,
        fields: [
          { name: 'Name', value: noPing(name), inline: true },
          { name: 'Contact', value: noPing(contact), inline: true },
          { name: 'Message', value: noPing(message) },
        ],
        footer: { text: 'Sent from the Community Manager website' },
        timestamp: new Date().toISOString(),
      }],
    });
    recent.push(now);
    hits.set(ip, recent);
    res.json({ success: true });
  } catch (err: any) {
    logger.warn(`[Contact] post failed: ${err?.message}`);
    res.status(502).json({ success: false, error: { message: 'Could not send right now. Please join our Discord instead.' } });
  }
}
