/**
 * One place that knows every switchable feature ("module") and whether it is on.
 * Everything starts OFF. Turning one on also creates the channels it needs, reusing any that already exist
 * (setupProvision.ts); turning it off never deletes anything.
 */
import { getToolkit, saveToolkit } from './toolkit/toolkitConfig.js';
import { getFeatures, saveFeatures } from './features/featuresConfig.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';

export interface ModuleInfo { key: string; label: string; description: string; enabled: boolean; group: 'Core' | 'Community' | 'Moderation' }

const DEFS: { key: string; label: string; description: string; group: ModuleInfo['group'] }[] = [
  { key: 'recruitment', label: 'Recruitment', description: 'Applications, review channel, recruitment log and the Apply to join channel for new joiners.', group: 'Core' },
  { key: 'welcome', label: 'Welcome & onboarding', description: 'Greets new members in a welcome channel.', group: 'Core' },
  { key: 'logs', label: 'Server logs', description: 'Joins, leaves, edits, deletions and role changes in a private log channel.', group: 'Core' },
  { key: 'roleRules', label: 'Role rules', description: 'Roles given automatically when an applicant is approved.', group: 'Core' },
  { key: 'reviewRooms', label: 'Review rooms', description: 'A private channel and voice room for each application.', group: 'Core' },
  { key: 'tickets', label: 'Tickets', description: 'Private support tickets opened with a button.', group: 'Moderation' },
  { key: 'warnings', label: 'Warnings', description: 'Warning points with automatic timeouts, kicks or bans.', group: 'Moderation' },
  { key: 'verification', label: 'Verification', description: 'Members press a button or solve a question to unlock the server.', group: 'Moderation' },
  { key: 'levels', label: 'Levels & XP', description: 'XP for chatting, level roles and a leaderboard.', group: 'Community' },
  { key: 'starboard', label: 'Starboard', description: 'Posts popular messages in a showcase channel.', group: 'Community' },
  { key: 'birthdays', label: 'Birthdays', description: 'Birthday messages and an optional birthday role.', group: 'Community' },
  { key: 'customCommands', label: 'Custom commands', description: 'Your own text commands such as !rules.', group: 'Community' },
];
export const MODULE_KEYS = DEFS.map((d) => d.key);

export async function listModules(communityId: string): Promise<ModuleInfo[]> {
  const [t, f, w] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true), welcomeOnboardingService.getWelcomeConfig(communityId)]);
  const state: Record<string, boolean> = {
    recruitment: Boolean(t.recruitment.applyEnabled), welcome: Boolean(w.enableServerWelcome), logs: Boolean(f.logs.enabled),
    roleRules: Boolean(t.roleRules.enabled), reviewRooms: Boolean(t.reviewRooms.enabled), tickets: Boolean(t.tickets.enabled), warnings: Boolean(t.warnings.enabled),
    verification: Boolean(f.verification.enabled), levels: Boolean(f.levels.enabled), starboard: Boolean(f.starboard.enabled),
    birthdays: Boolean(f.birthdays.enabled), customCommands: Boolean(f.customCommands.enabled),
  };
  return DEFS.map((d) => ({ ...d, enabled: state[d.key] }));
}

/** Switches one module on or off. Returns the channels it created and anything it could not do. */
export async function setModule(communityId: string, key: string, enabled: boolean): Promise<{ made: string[]; errors: string[] }> {
  if (!MODULE_KEYS.includes(key)) throw new Error('Unknown feature.');
  const out = { made: [] as string[], errors: [] as string[] };
  const t: any = await getToolkit(communityId);
  const f: any = await getFeatures(communityId, true);

  if (key === 'recruitment') await saveToolkit(communityId, { recruitment: { ...t.recruitment, applyEnabled: enabled } });
  else if (key === 'welcome') await welcomeOnboardingService.updateWelcomeConfig(communityId, { enableServerWelcome: enabled } as any);
  else if (key === 'logs') await saveFeatures(communityId, { logs: { ...f.logs, enabled } });
  else if (['roleRules', 'reviewRooms', 'tickets', 'warnings'].includes(key)) await saveToolkit(communityId, { [key]: { ...t[key], enabled } } as any);
  else await saveFeatures(communityId, { [key]: { ...f[key], enabled } } as any);

  // Channels are created only when a feature is switched ON, and only the ones it needs.
  // (The welcome channel is created by updateWelcomeConfig itself when it is switched on.)
  if (enabled && ['recruitment', 'logs'].includes(key)) {
    const { provisionForFeature } = await import('../integrations/discord/setupProvision.js');
    const r = await provisionForFeature(communityId, key as 'recruitment' | 'logs').catch((e: any) => ({ made: [] as string[], errors: [String(e?.message || e)] }));
    out.made = r.made as string[];
    out.errors = r.errors;
  }
  return out;
}
