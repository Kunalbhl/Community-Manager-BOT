import { FirestoreRepository } from './firestore.repository.js';
import { DiscordOAuthSession } from '../../shared/types/models.js';

export class SessionRepository extends FirestoreRepository<DiscordOAuthSession> {
  constructor() {
    super('sessions');
  }

  async getSessionByToken(sessionToken: string): Promise<DiscordOAuthSession | null> {
    if (!sessionToken) return null;
    let session = await this.getById(sessionToken);
    if (!session) {
      const results = await this.list({
        where: [{ field: 'sessionId', operator: '==', value: sessionToken }]
      });
      if (results.length > 0) {
        session = results[0];
      }
    }
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt) {
      const expiresMillis = new Date(session.expiresAt).getTime();
      if (expiresMillis && expiresMillis <= Date.now()) {
        return null;
      }
    }
    return session;
  }

  async getActiveSessionByUserId(discordUserId: string): Promise<DiscordOAuthSession | null> {
    const results = await this.list({
      where: [{ field: 'discordUserId', operator: '==', value: discordUserId }]
    });
    const valid = results.filter(s => !s.revokedAt);
    if (valid.length === 0) return null;
    valid.sort((a, b) => new Date(b.updatedAt || b.authenticatedAt).getTime() - new Date(a.updatedAt || a.authenticatedAt).getTime());
    return valid[0];
  }

  async revokeSession(sessionToken: string): Promise<boolean> {
    const session = await this.getSessionByToken(sessionToken);
    if (!session || !session.id) return false;
    await this.update(session.id, {
      ...session,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }
}

export const sessionRepository = new SessionRepository();
