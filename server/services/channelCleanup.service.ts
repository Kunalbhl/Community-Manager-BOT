/**
 * Removes channels the bot created for a feature that is switched OFF and that nobody has used.
 *
 * A channel is removed only when ALL of these hold:
 *  - it is the channel a switched-off feature points to (review/log/panel, welcome, server log),
 *  - no switched-on feature points to it,
 *  - it holds nothing but messages written by the bot itself (the guide card it posted).
 * Anything else, including a channel people have talked in, is left alone.
 */
import { getToolkit, saveToolkit, guildFor } from './toolkit/toolkitConfig.js';
import { getFeatures, saveFeatures } from './features/featuresConfig.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';
import { enabledFeatures } from '../integrations/discord/setupProvision.js';

export interface CleanupItem { id: string; name: string; feature: string; removed?: boolean; error?: string }

const SNOWFLAKE = /\b\d{17,20}\b/g;

export async function cleanupUnusedChannels(communityId: string, apply: boolean): Promise<{ items: CleanupItem[]; skipped: string[] }> {
  const guild: any = await guildFor(communityId);
  if (!guild) throw new Error('The bot is not connected to this server right now.');
  if (!guild.members.me?.permissions.has('ManageChannels')) throw new Error('The bot needs the Manage Channels permission to remove channels.');
  const botId = guild.client.user.id;
  const on = await enabledFeatures(communityId);
  const [t, f, w]: any[] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true), welcomeOnboardingService.getWelcomeConfig(communityId)]);
  const { getGate } = await import('./recruitment/secureGate.service.js');
  const gate: any = await getGate(communityId);

  // Channels that something switched on still uses.
  const inUse = new Set<string>();
  const scan = (o: unknown) => { for (const m of JSON.stringify(o ?? {}).match(SNOWFLAKE) || []) inUse.add(m); };
  if (on.recruitment) { scan(t.recruitment); scan(gate); }
  if (on.welcome) scan({ c: w.welcomeChannelId, l: w.leaveChannelId });
  if (on.logs) scan(f.logs);
  for (const k of ['tickets', 'warnings', 'roleRules', 'reviewRooms'] as const) if (t[k]?.enabled) scan(t[k]);
  for (const k of ['levels', 'verification', 'starboard', 'birthdays', 'customCommands'] as const) if (f[k]?.enabled) scan(f[k]);

  const candidates: { id?: string; feature: string; clear: () => Promise<void> }[] = [];
  const clearRec = (keys: string[]) => async () => { const cur: any = await getToolkit(communityId); const patch: any = {}; for (const k of keys) patch[k] = undefined; await saveToolkit(communityId, { recruitment: { ...cur.recruitment, ...patch } }); };
  if (!on.recruitment) {
    candidates.push({ id: t.recruitment.reviewChannelId, feature: 'Recruitment', clear: clearRec(['reviewChannelId']) });
    candidates.push({ id: t.recruitment.logChannelId, feature: 'Recruitment', clear: clearRec(['logChannelId']) });
    candidates.push({ id: t.recruitment.panelChannelId, feature: 'Recruitment', clear: clearRec(['panelChannelId', 'panelMessageId', 'panelPostedAt']) });
  }
  if (!on.welcome) candidates.push({ id: w.welcomeChannelId, feature: 'Welcome', clear: async () => { await welcomeOnboardingService.updateWelcomeConfig(communityId, { welcomeChannelId: '', welcomeChannelNameSnapshot: '' } as any); } });
  if (!on.logs) candidates.push({ id: f.logs.channelId, feature: 'Server logs', clear: async () => { const cur: any = await getFeatures(communityId, true); await saveFeatures(communityId, { logs: { ...cur.logs, channelId: undefined } } as any); } });

  const items: CleanupItem[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const ch: any = guild.channels.cache.get(c.id);
    if (!ch) continue; // already gone
    if (inUse.has(c.id)) { skipped.push(`#${ch.name}: still used by a feature that is on`); continue; }
    const msgs: any = await ch.messages?.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) { skipped.push(`#${ch.name}: could not read it, left alone`); continue; }
    if ([...msgs.values()].some((m: any) => m.author?.id !== botId)) { skipped.push(`#${ch.name}: people have written in it, left alone`); continue; }
    const item: CleanupItem = { id: c.id, name: ch.name, feature: c.feature };
    if (apply) {
      try { await ch.delete('Community Manager: created for a feature that is off and never used'); await c.clear(); item.removed = true; }
      catch (e: any) { item.error = String(e?.message || e); }
    }
    items.push(item);
  }
  return { items, skipped };
}
