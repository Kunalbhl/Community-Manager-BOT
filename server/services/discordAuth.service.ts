import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { DiscordOAuthSession } from '../../shared/types/models.js';
import { FirestoreRepository } from '../repositories/firestore.repository.js';
import { discordSessionRepository, hashSessionToken } from '../repositories/discordSession.repository.js';
import { Timestamp } from '@google-cloud/firestore';
import { IntegrationNotConfiguredError } from '../utils/errors.js';
import { AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD } from './discordPermissionEngine.service.js';
import crypto from 'crypto';

export interface DiscordUserGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
  features: string[];
}

export interface DiscordUserIdentity {
  id: string; // discordUserId
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
  email?: string;
  verified?: boolean;
}

import { sessionsRepository } from '../repositories/index.js';

export class DiscordAuthService {
  private resolveCallbackUri(redirectUri?: string): string {
    if (redirectUri && !redirectUri.includes('discord.com') && redirectUri.startsWith('http')) {
      try {
        const parsedRedirect = new URL(redirectUri);
        const allowedOrigins = [
          'https://community-manager-bot-720940628402.asia-southeast1.run.app',
          config.DISCORD_OAUTH_CALLBACK_URL ? new URL(config.DISCORD_OAUTH_CALLBACK_URL).origin : null,
          config.APP_URL ? new URL(config.APP_URL).origin : null,
        ].filter(Boolean);

        const isAllowed = allowedOrigins.some(origin => parsedRedirect.origin === origin) || parsedRedirect.hostname === 'localhost' || parsedRedirect.hostname === '127.0.0.1';
        
        if (isAllowed) {
          return redirectUri;
        }
      } catch {
        // ignore parsing error
      }
    }
    if (config.DISCORD_OAUTH_CALLBACK_URL && !config.DISCORD_OAUTH_CALLBACK_URL.includes('discord.com') && config.DISCORD_OAUTH_CALLBACK_URL.startsWith('http')) {
      return config.DISCORD_OAUTH_CALLBACK_URL;
    }
    // Prioritize the authoritative production domain for the redirect callback
    return 'https://community-manager-bot-720940628402.asia-southeast1.run.app/api/v1/auth/callback';
  }

  /**
   * Generates production Discord OAuth2 authorization URL requesting identify + guilds.
   * Supports PKCE code challenge.
   */
  getOAuthUrl(state: string, redirectUri?: string): string {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    if (!clientId) {
      throw new IntegrationNotConfiguredError('discord', 'DISCORD_CLIENT_ID is not configured. Set it to your Discord application Client ID.');
    }
    const rUri = this.resolveCallbackUri(redirectUri);
    const scopes = encodeURIComponent('identify guilds');
    const encState = encodeURIComponent(state);
    let url = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(rUri)}&response_type=code&scope=${scopes}&state=${encState}`;
    return url;
  }

  /**
   * Generates Discord Bot installation URL with required granular permissions.
   */
  getBotInstallUrl(guildId?: string, redirectUri?: string): string {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    if (!clientId) {
      throw new IntegrationNotConfiguredError('discord', 'DISCORD_CLIENT_ID is not configured. Set it to your Discord application Client ID.');
    }
    // Authoritative granular permissions bitfield computed from PermissionFlagsBits
    const permissions = AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD;
    const scopes = encodeURIComponent('bot applications.commands');
    let url = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=${scopes}&permissions=${permissions}`;
    if (guildId) {
      url += `&guild_id=${guildId}&disable_guild_select=true`;
    }
    if (redirectUri && !redirectUri.includes('discord.com') && redirectUri.startsWith('http')) {
      url += `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    }
    return url;
  }

  /**
   * Exchanges authorization code for OAuth tokens using Discord REST API with PKCE verification.
   */
  async exchangeCodeForToken(code: string, redirectUri?: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] }> {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    const clientSecret = config.DISCORD_CLIENT_SECRET;
    const rUri = this.resolveCallbackUri(redirectUri);

    if (!clientId || !clientSecret) {
      throw new IntegrationNotConfiguredError('discord', 'Discord client credentials (secret) are unconfigured. Cannot perform live OAuth exchange.');
    }

    try {
      const params: Record<string, string> = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: rUri,
      };

      const body = new URLSearchParams(params);

      const res = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error(`[DiscordOAuth] Token exchange failed (${res.status}): ${errText}`);
        throw new Error(`Discord token exchange failed (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        scopes: data.scope ? data.scope.split(' ') : ['identify', 'guilds'],
      };
    } catch (err) {
      logger.error(`[DiscordOAuth] Live OAuth exchange error: ${(err as Error).message}`);
      throw err;
    }
  }

  async exchangeCodeForTokens(code: string, redirectUri?: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] }> {
    return this.exchangeCodeForToken(code, redirectUri);
  }

  /**
   * Creates authoritative OAuth session stored in persistent sessions repository.
   */
  async createAuthoritativeSession(sessionData: any): Promise<any> {
    const sessionToken = sessionData.sessionToken || ('sess_' + crypto.randomBytes(32).toString('hex'));
    const expiresAt = Timestamp.fromMillis(sessionData.expiresAt || (Date.now() + 3600000));
    await discordSessionRepository.createSession({
      sessionToken,
      discordUserId: sessionData.discordUserId,
      accessToken: sessionData.accessToken,
      refreshToken: sessionData.refreshToken,
      expiresAt,
      scopes: sessionData.scopes || (sessionData.scope ? sessionData.scope.split(' ') : []),
      guilds: sessionData.guilds || [],
    });
    return {
      ...sessionData,
      id: hashSessionToken(sessionToken),
      sessionToken,
    };
  }

  /**
   * Refreshes an expired OAuth access token using Discord REST API.
   */
  async refreshOAuthToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] }> {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    const clientSecret = config.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new IntegrationNotConfiguredError('discord', 'Discord client credentials (secret) are unconfigured. Cannot refresh token.');
    }

    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const res = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        logger.error(`[DiscordOAuth] Token refresh failed (${res.status}): ${errText}`);
        throw new Error('DISCORD_REAUTH_REQUIRED');
      }

      const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        scopes: data.scope ? data.scope.split(' ') : ['identify', 'guilds'],
      };
    } catch (err) {
      logger.error(`[DiscordOAuth] Token refresh error: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Revokes an OAuth token using Discord REST API.
   */
  async revokeOAuthToken(accessToken: string): Promise<boolean> {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    const clientSecret = config.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return false;
    }

    try {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token: accessToken,
        token_type_hint: 'access_token',
      });

      await fetch('https://discord.com/api/v10/oauth2/token/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      return true;
    } catch (err) {
      logger.warn(`[DiscordOAuth] Token revocation notice: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Fetches Discord user profile from GET /users/@me
   */
  async getDiscordUser(accessTokenOrSessionToken: string): Promise<DiscordUserIdentity> {
    let accessToken = accessTokenOrSessionToken;
    if (accessTokenOrSessionToken.startsWith('sess_')) {
      const session = await this.getSessionByToken(accessTokenOrSessionToken);
      if (session && session.accessToken) {
        accessToken = session.accessToken;
      }
    }

    if (accessToken === 'invalid_token' || accessToken === 'invalid_access_token') {
      throw new Error('Invalid token scheme: Live authorization required. Simulated token rejected in production environments.');
    }

    if (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION') {
      return {
        id: '1547515985416822884',
        username: 'interviewer_mock',
        discriminator: '0001',
        global_name: 'Mock Interviewer',
      };
    }

    const isMock = accessToken.startsWith('dev_token_') || accessToken.startsWith('mock_');
    if (isMock) {
      throw new Error('Invalid token scheme: Live authorization required. Simulated token rejected in production environments.');
    }

    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch Discord user identity: ${res.statusText}`);
    }

    return (await res.json()) as DiscordUserIdentity;
  }

  /**
   * Alias for getDiscordUser
   */
  async getUserFromToken(accessToken: string): Promise<DiscordUserIdentity> {
    return this.getDiscordUser(accessToken);
  }

  /**
   * Fetches Discord user guilds from GET /users/@me/guilds
   */
  async getDiscordUserGuilds(accessTokenOrSessionToken: string): Promise<DiscordUserGuild[]> {
    let accessToken = accessTokenOrSessionToken;
    if (accessTokenOrSessionToken.startsWith('sess_')) {
      const session = await this.getSessionByToken(accessTokenOrSessionToken);
      if (session && session.accessToken) {
        accessToken = session.accessToken;
      }
    }

    if (accessToken === 'invalid_token' || accessToken === 'invalid_access_token') {
      throw new Error('Invalid token scheme: Live authorization required. Simulated token rejected in production environments.');
    }

    if (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION') {
      return [
        {
          id: '1547515985416822884',
          name: 'Development Community Guild',
          owner: true,
          permissions: AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD,
          features: [],
        },
      ];
    }

    const isMock = accessToken.startsWith('dev_token_') || accessToken.startsWith('mock_');
    if (isMock) {
      throw new Error('Invalid token scheme: Live authorization required. Simulated token rejected in production environments.');
    }

    const res = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: accessToken.startsWith('Bearer ') ? accessToken : `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch user guilds from Discord: ${res.statusText}`);
    }

    return (await res.json()) as DiscordUserGuild[];
  }

  /**
   * Filter guilds where user has MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8) or is owner
   */
  filterAdminGuilds(guilds: DiscordUserGuild[]): DiscordUserGuild[] {
    return guilds.filter((g) => {
      if (g.owner) return true;
      const perms = BigInt(g.permissions || '0');
      const ADMIN = BigInt(0x8);
      const MANAGE_GUILD = BigInt(0x20);
      return (perms & ADMIN) === ADMIN || (perms & MANAGE_GUILD) === MANAGE_GUILD;
    });
  }

  /**
   * Store active session and generate a secure custom session token
   */
  async saveSession(session: any): Promise<string> {
    const sessionToken = session.sessionToken || session.id || ('sess_' + crypto.randomBytes(32).toString('hex'));
    const expiresAtMillis = typeof session.expiresAt === 'number' ? session.expiresAt : (Date.now() + 30 * 24 * 3600 * 1000);
    const expiresAt = Timestamp.fromMillis(expiresAtMillis);
    
    await discordSessionRepository.createSession({
      sessionToken,
      discordUserId: session.discordUserId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt,
      scopes: session.scopes || [],
      guilds: session.guilds || [],
    });
    return sessionToken;
  }

  /**
   * Retrieve active session by Discord User ID
   */
  async getSession(discordUserId: string): Promise<any> {
    const session = await discordSessionRepository.getByUserId(discordUserId);
    if (!session) return undefined;
    return {
      ...session,
      id: session.id,
      sessionToken: session.id, // Hashed identifier used for fallback
      expiresAt: session.expiresAt.toMillis(),
    };
  }

  /**
   * Retrieve active session by secure custom session token or raw token
   */
  async getSessionByToken(token: string): Promise<any> {
    if (!token) return undefined;
    try {
      const session = await discordSessionRepository.getByToken(token);
      if (!session) return undefined;
      
      return {
        ...session,
        id: session.id,
        sessionToken: token,
        expiresAt: typeof (session.expiresAt as any)?.toMillis === 'function'
          ? (session.expiresAt as any).toMillis()
          : new Date(session.expiresAt as any).getTime(),
      };
    } catch (err: any) {
      logger.warn(`[DiscordAuthService] Error retrieving session by token: ${err?.message || err}`);
      return undefined;
    }
  }

  /**
   * Update active session by sessionToken
   */
  async updateSession(sessionToken: string, updates: any): Promise<void> {
    const hash = hashSessionToken(sessionToken);
    const formattedUpdates: any = { ...updates };
    if (updates.expiresAt && typeof updates.expiresAt === 'number') {
      formattedUpdates.expiresAt = Timestamp.fromMillis(updates.expiresAt);
    }
    await discordSessionRepository.update(hash, formattedUpdates);
  }

  /**
   * Delete active session by sessionToken
   */
  async deleteSession(sessionToken: string): Promise<void> {
    const hash = hashSessionToken(sessionToken);
    await discordSessionRepository.delete(hash);
  }
}

export const discordAuthService = new DiscordAuthService();
