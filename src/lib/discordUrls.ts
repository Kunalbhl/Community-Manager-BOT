/**
 * Authoritative Discord URL and Installation Configuration Helpers
 */

export interface AddToDiscordOptions {
  guildId?: string;
  redirectUri?: string;
}

/**
 * The Discord Client ID — sourced from VITE_DISCORD_CLIENT_ID at build time.
 * This is NOT a secret. It appears in every Discord OAuth URL.
 * It must match your server's DISCORD_CLIENT_ID exactly.
 */
export const AUTHORITATIVE_DISCORD_CLIENT_ID: string | undefined =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DISCORD_CLIENT_ID) || undefined;

export function isDiscordClientConfigured(): boolean {
  return Boolean(
    (typeof window !== 'undefined' && (window as any).__DISCORD_CLIENT_ID__) ||
    AUTHORITATIVE_DISCORD_CLIENT_ID
  );
}

export function getDiscordClientId(): string | undefined {
  return (
    (typeof window !== 'undefined' && (window as any).__DISCORD_CLIENT_ID__) ||
    AUTHORITATIVE_DISCORD_CLIENT_ID ||
    undefined
  );
}

function resolveClientIdOrWarn(): string {
  const id = getDiscordClientId();
  if (!id) {
    console.error('[DiscordUrls] VITE_DISCORD_CLIENT_ID is not set. Add-to-Discord and OAuth links will not work. Set this env var to your Discord Application Client ID and rebuild.');
    return '';
  }
  return id;
}

export const AUTHORITATIVE_DISCORD_PERMISSIONS = {
  ViewChannel: 1024n,
  SendMessages: 2048n,
  ManageMessages: 8192n,
  EmbedLinks: 16384n,
  AttachFiles: 32768n,
  ReadMessageHistory: 65536n,
  ManageRoles: 268435456n,
  UseApplicationCommands: 2147483648n,
  ManageChannels: 16n,
  CreateInstantInvite: 1n,
  AddReactions: 64n,
  Connect: 1048576n,
  MoveMembers: 16777216n,
  ManageThreads: 17179869184n,
  CreatePublicThreads: 34359738368n,
  CreatePrivateThreads: 68719476736n,
  SendMessagesInThreads: 274877906944n,
  KickMembers: 2n,
  BanMembers: 4n,
  ModerateMembers: 1099511627776n,
  ManageNicknames: 134217728n,
  ViewAuditLog: 128n,
  SendPolls: 562949953421312n,
  ChangeNickname: 67108864n,
};

export function buildAuthoritativeInstallPermissions(): string {
  const sum = Object.values(AUTHORITATIVE_DISCORD_PERMISSIONS).reduce((acc, p) => acc | p, 0n);
  return sum.toString();
}

export const AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD = buildAuthoritativeInstallPermissions();

/**
 * Returns the Add to Discord Bot installation URL.
 * Requires VITE_DISCORD_CLIENT_ID to be set at build time.
 */
export function getAddToDiscordUrl(options: AddToDiscordOptions = {}): string {
  // Through our own sign-in so Discord sends the person back to finish setup afterwards.
  if (!options.redirectUri && typeof window !== 'undefined') {
    return `${getAuthoritativeAppOrigin()}/api/v1/auth/login?redirect=true&install=1${options.guildId ? `&guildId=${encodeURIComponent(options.guildId)}` : ''}`;
  }
  const clientId = resolveClientIdOrWarn();
  const permissions = AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD;
  const scopes = encodeURIComponent('bot applications.commands');
  let url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=${scopes}&permissions=${permissions}`;

  if (options.guildId) {
    url += `&guild_id=${options.guildId}&disable_guild_select=true`;
  }

  if (options.redirectUri) {
    url += `&redirect_uri=${encodeURIComponent(options.redirectUri)}`;
  }

  return url;
}

/**
 * Canonical production application origin for Discord OAuth.
 */
export const CANONICAL_PRODUCTION_ORIGIN =
  'https://community-manager-bot-720940628402.asia-southeast1.run.app';

export function getAuthoritativeAppOrigin(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return window.location.origin;
    }
  }
  return CANONICAL_PRODUCTION_ORIGIN;
}

/**
 * Returns the canonical Backend Discord OAuth Login entry point URL.
 * Sourced from the authoritative production origin (or localhost in dev).
 * The server generates a secure cryptographically random state and redirects to Discord.
 */
export function getDiscordLoginUrl(): string {
  const origin = getAuthoritativeAppOrigin();
  return `${origin}/api/v1/auth/login?redirect=true`;
}
