import { FirestoreRepository } from './firestore.repository.js';
import { Timestamp } from '@google-cloud/firestore';
import crypto from 'crypto';

export interface DiscordOAuthState {
  id: string; // stateHash
  stateHash: string;
  codeVerifierHash: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  consumedAt?: Timestamp;
  redirectUri?: string;
  returnTo?: string;
}

export function hashString(str: string): string {
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
}

export class DiscordOAuthStateRepository extends FirestoreRepository<DiscordOAuthState> {
  constructor() {
    super('discordOAuthStates');
  }

  async createState(
    state: string,
    codeVerifier: string,
    expiresInMs: number = 10 * 60 * 1000,
    redirectUri?: string,
    returnTo?: string
  ): Promise<DiscordOAuthState> {
    const stateHash = hashString(state);
    const codeVerifierHash = hashString(codeVerifier);
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + expiresInMs);
    
    const record: DiscordOAuthState = {
      id: stateHash,
      stateHash,
      codeVerifierHash,
      createdAt: now,
      expiresAt,
    };
    if (redirectUri) record.redirectUri = redirectUri;
    if (returnTo) record.returnTo = returnTo;
    
    await this.upsert(record);
    return record;
  }

  async getByState(state: string): Promise<DiscordOAuthState | null> {
    if (!state) return null;
    const stateHash = hashString(state);
    let record = await this.getById(stateHash);
    if (!record) {
      record = await this.getById(state);
    }
    if (!record) {
      const listRes = await this.list({
        where: [{ field: 'stateHash', operator: '==', value: stateHash }],
        limit: 1,
      });
      if (listRes.length > 0) {
        record = listRes[0];
      }
    }
    return record;
  }

  async consumeState(state: string): Promise<DiscordOAuthState | null> {
    if (!state) return null;
    const stateHash = hashString(state);
    
    const record = await this.getByState(state);
    if (!record) return null;
    
    const expiresMillis = typeof (record.expiresAt as any)?.toMillis === 'function'
      ? (record.expiresAt as any).toMillis()
      : typeof (record.expiresAt as any)?._seconds === 'number'
      ? (record.expiresAt as any)._seconds * 1000
      : new Date(record.expiresAt as any).getTime();

    if (record.consumedAt || expiresMillis < Date.now()) {
      return null;
    }
    
    const targetId = record.id || stateHash;
    const updated = {
      ...record,
      consumedAt: Timestamp.now(),
    };
    
    await this.update(targetId, updated);
    return updated;
  }
}

export const discordOAuthStateRepository = new DiscordOAuthStateRepository();
