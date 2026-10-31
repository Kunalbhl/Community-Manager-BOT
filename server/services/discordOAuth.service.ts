import { discordAuthService } from './discordAuth.service.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { DiscordOAuthSession } from '../../shared/types/models.js';

export class DiscordOAuthService {
  getOAuthUrl(state: string, redirectUri?: string): string {
    return discordAuthService.getOAuthUrl(state, redirectUri);
  }

  async handleOAuthCallback(code: string, state: string, redirectUri?: string) {
    const tokens = await discordAuthService.exchangeCodeForToken(code, redirectUri);
    const user = await discordAuthService.getDiscordUser(tokens.accessToken);
    const guilds = await discordAuthService.getDiscordUserGuilds(tokens.accessToken);

    const sessionData = {
      id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      discordUserId: user.id,
      username: user.username,
      globalName: user.global_name,
      avatar: user.avatar,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      authenticatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      guilds: guilds.map(g => ({ id: g.id, owner: g.owner, permissions: g.permissions })),
    };

    await sessionRepository.create(sessionData as any);
    return sessionData;
  }

  async getDiscordUser(accessTokenOrSessionToken: string) {
    return discordAuthService.getDiscordUser(accessTokenOrSessionToken);
  }

  async getDiscordUserGuilds(accessTokenOrSessionToken: string) {
    return discordAuthService.getDiscordUserGuilds(accessTokenOrSessionToken);
  }

  async getSession(sessionToken: string): Promise<DiscordOAuthSession | null> {
    return sessionRepository.getSessionByToken(sessionToken);
  }
}

export const discordOAuthService = new DiscordOAuthService();
