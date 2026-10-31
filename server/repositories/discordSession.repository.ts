import { FirestoreRepository, getFirestoreDb } from './firestore.repository.js';
import { Timestamp } from '@google-cloud/firestore';
import crypto from 'crypto';

export interface DiscordSession {
  id: string; // The sessionTokenHash
  sessionTokenHash: string;
  discordUserId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Timestamp;
  scopes: string[];
  guilds: any[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  revokedAt?: Timestamp;
}

export function hashSessionToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

export class DiscordSessionRepository extends FirestoreRepository<DiscordSession> {
  constructor() {
    super('discordSessions');
  }

  async createSession(data: {
    sessionToken: string;
    discordUserId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: Timestamp;
    scopes: string[];
    guilds: any[];
  }): Promise<DiscordSession> {
    const hash = hashSessionToken(data.sessionToken);
    const now = Timestamp.now();
    const session: DiscordSession = {
      id: hash,
      sessionTokenHash: hash,
      discordUserId: data.discordUserId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scopes: data.scopes || [],
      guilds: data.guilds || [],
      createdAt: now,
      updatedAt: now,
    };
    await this.create(session);
    return session;
  }

  async getByToken(token: string): Promise<DiscordSession | null> {
    if (!token) return null;
    const hash = hashSessionToken(token);
    let session = await this.getById(hash);
    if (!session) {
      const listRes = await this.list({
        where: [{ field: 'sessionTokenHash', operator: '==', value: hash }]
      });
      if (listRes.length > 0) {
        session = listRes[0];
      }
    }
    if (!session) return null;

    // 1. Session must not be revoked
    if (session.revokedAt) {
      return null;
    }

    // 2. Session must not be expired
    if (session.expiresAt) {
      const expiresMillis = typeof (session.expiresAt as any).toMillis === 'function'
        ? (session.expiresAt as any).toMillis()
        : new Date(session.expiresAt as any).getTime();
      if (expiresMillis && expiresMillis <= Date.now()) {
        return null;
      }
    }

    return session;
  }

  async getByUserId(discordUserId: string): Promise<DiscordSession | null> {
    if (!discordUserId) return null;
    const results = await this.list({
      where: [
        { field: 'discordUserId', operator: '==', value: discordUserId },
      ],
    });
    const valid = results.filter(s => !s.revokedAt);
    if (valid.length === 0) return null;
    // Sort descending by updatedAt
    valid.sort((a, b) => {
      const tA = a.updatedAt ? a.updatedAt.toMillis() : 0;
      const tB = b.updatedAt ? b.updatedAt.toMillis() : 0;
      return tB - tA;
    });
    return valid[0];
  }

  async revoke(token: string): Promise<boolean> {
    if (!token) return false;
    const session = await this.getByToken(token);
    if (!session) return false;
    
    await this.update(session.id, {
      ...session,
      revokedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return true;
  }

  async deleteExpired(): Promise<number> {
    const now = Timestamp.now();
    const expired = await this.list({
      where: [{ field: 'expiresAt', operator: '<=', value: now }]
    });
    let count = 0;
    for (const session of expired) {
      await this.delete(session.id);
      count++;
    }
    return count;
  }
}

export const discordSessionRepository = new DiscordSessionRepository();
