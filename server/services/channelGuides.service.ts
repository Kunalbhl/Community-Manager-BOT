/**
 * Channel guides: once setup is confirmed, every channel that has a purpose gets one pinned message
 * saying what it is for and how it is used. Re-running edits the same message instead of adding another.
 */
import { logger } from '../logging/logger.js';
import { getToolkit } from './toolkit/toolkitConfig.js';
import { getFeatures } from './features/featuresConfig.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';
import { upsertBotEmbed } from './botMessages.js';
import { GUIDES, GUIDE_FOOTER, type Guide } from './channelGuideText.js';

export { GUIDES, GUIDE_FOOTER };

async function post(channel: any, g: Guide, botId: string): Promise<'posted' | 'updated' | 'skipped'> {
  if (!channel?.send) return 'skipped';
  const embed = { title: g.title, description: g.body, color: 0x7c8cff, footer: { text: GUIDE_FOOTER } };
  try {
    return await upsertBotEmbed(channel, botId, embed, (m: any) => m.embeds?.[0]?.footer?.text === GUIDE_FOOTER, { pin: true });
  } catch (e: any) {
    logger.warn(`[ChannelGuides] ${channel?.id}: ${e?.message}`);
    return 'skipped';
  }
}

/** Post (or refresh) the guide in each purpose channel. Never throws. Returns how many channels were handled. */
export async function postChannelGuides(communityId: string, guild: any): Promise<{ posted: number; updated: number; skipped: number }> {
  const out = { posted: 0, updated: 0, skipped: 0 };
  try {
    const [t, f, w] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true), welcomeOnboardingService.getWelcomeConfig(communityId)]);
    const r: any = t.recruitment;
    const plan: [string | undefined, Guide][] = [
      [r.panelChannelId, GUIDES.apply],
      [w.welcomeChannelId, GUIDES.welcome],
      [r.reviewChannelId, GUIDES.review],
      [r.logChannelId, GUIDES.recruitmentLog],
      [f.logs?.enabled ? f.logs.channelId : undefined, GUIDES.serverLog],
    ];
    const seen = new Set<string>();
    const botId = guild.members.me?.id || guild.client?.user?.id;
    for (const [cid, g] of plan) {
      if (!cid || seen.has(cid)) continue; // one guide per channel, even if two purposes share it
      seen.add(cid);
      const ch = await guild.channels.fetch(cid).catch(() => null);
      if (!ch) { out.skipped++; continue; }
      out[await post(ch, g, botId)]++;
    }
  } catch (e: any) { logger.warn(`[ChannelGuides] ${e?.message}`); }
  return out;
}
