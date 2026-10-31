import { Firestore } from '@google-cloud/firestore';
import { QueryOptions } from './base.repository.js';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { isPostgresEnabled, postgresStore } from './postgres.store.js';

export interface IPersistenceProvider {
  getById<T extends { id: string }>(collectionName: string, id: string): Promise<T | null>;
  list<T extends { id: string }>(collectionName: string, options?: QueryOptions): Promise<T[]>;
  create<T extends { id: string }>(collectionName: string, id: string, data: any): Promise<T>;
  update<T extends { id: string }>(collectionName: string, id: string, updates: Partial<T>): Promise<T>;
  upsert<T extends { id: string }>(collectionName: string, id: string, data: any): Promise<T>;
  delete(collectionName: string, id: string): Promise<boolean>;
  count(collectionName: string, options?: QueryOptions): Promise<number>;
}

export class FirestorePersistenceProvider implements IPersistenceProvider {
  private db: Firestore;

  constructor() {
    const projectId = config.GOOGLE_CLOUD_PROJECT_ID;
    let databaseId = config.FIRESTORE_DATABASE_ID;
    if (databaseId && (databaseId.startsWith('http://') || databaseId.startsWith('https://') || databaseId.includes('/'))) {
      databaseId = undefined;
    }
    const effectiveDatabaseId = databaseId === '(default)' ? undefined : databaseId;

    if (!projectId) {
      throw new Error('CONFIGURATION_REQUIRED: GOOGLE_CLOUD_PROJECT_ID is mandatory for FirestorePersistenceProvider in production.');
    }

    this.db = new Firestore({
      projectId,
      databaseId: effectiveDatabaseId,
    });
    logger.info(`FirestorePersistenceProvider initialized for project: ${projectId}, database: ${effectiveDatabaseId || '(default)'}`);
  }

  async getById<T extends { id: string }>(collectionName: string, id: string): Promise<T | null> {
    try {
      const docRef = this.db.collection(collectionName).doc(id);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        return { ...(docSnap.data() as any), id } as T;
      }
      return null;
    } catch (err) {
      logger.error(`Firestore getById error on collection ${collectionName}, id ${id}:`, err);
      throw err;
    }
  }

  async list<T extends { id: string }>(collectionName: string, options?: QueryOptions): Promise<T[]> {
    try {
      let q: any = this.db.collection(collectionName);
      
      if (options?.where && options.where.length > 0) {
        for (const filter of options.where) {
          q = q.where(filter.field, filter.operator, filter.value);
        }
      }
      
      if (options?.limit) {
        q = q.limit(options.limit);
      }
      
      if (options?.offset) {
        q = q.offset(options.offset);
      }
      
      const querySnapshot = await q.get();
      const results: T[] = [];
      querySnapshot.forEach((doc: any) => {
        results.push({ ...(doc.data() as any), id: doc.id } as T);
      });
      
      return results;
    } catch (err) {
      logger.error(`Firestore list error on collection ${collectionName}:`, err);
      throw err;
    }
  }

  async create<T extends { id: string }>(collectionName: string, id: string, data: any): Promise<T> {
    try {
      const docRef = this.db.collection(collectionName).doc(id);
      await docRef.set(data);
      return data as T;
    } catch (err) {
      logger.error(`Firestore create error on collection ${collectionName}:`, err);
      throw err;
    }
  }

  async update<T extends { id: string }>(collectionName: string, id: string, updates: Partial<T>): Promise<T> {
    try {
      const docRef = this.db.collection(collectionName).doc(id);
      await docRef.update(updates as any);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new Error(`Document ${id} not found in collection ${collectionName}`);
      }
      return { ...(docSnap.data() as any), id } as T;
    } catch (err) {
      logger.error(`Firestore update error on collection ${collectionName}, id ${id}:`, err);
      throw err;
    }
  }

  async upsert<T extends { id: string }>(collectionName: string, id: string, data: any): Promise<T> {
    try {
      const docRef = this.db.collection(collectionName).doc(id);
      await docRef.set(data, { merge: true });
      const docSnap = await docRef.get();
      return { ...(docSnap.data() as any), id } as T;
    } catch (err) {
      logger.error(`Firestore upsert error on collection ${collectionName}, id ${id}:`, err);
      throw err;
    }
  }

  async delete(collectionName: string, id: string): Promise<boolean> {
    try {
      const docRef = this.db.collection(collectionName).doc(id);
      await docRef.delete();
      return true;
    } catch (err) {
      logger.error(`Firestore delete error on collection ${collectionName}, id ${id}:`, err);
      throw err;
    }
  }

  async count(collectionName: string, options?: QueryOptions): Promise<number> {
    try {
      let q: any = this.db.collection(collectionName);
      if (options?.where && options.where.length > 0) {
        for (const filter of options.where) {
          q = q.where(filter.field, filter.operator, filter.value);
        }
      }
      const countSnap = await q.count().get();
      return countSnap.data().count;
    } catch (err) {
      logger.error(`Firestore count error on collection ${collectionName}:`, err);
      throw err;
    }
  }
}

export class DevelopmentSimulationPersistenceProvider implements IPersistenceProvider {
  private memoryStores: Map<string, Map<string, any>> = new Map();

  constructor() {
    if (config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW') {
      throw new Error('FAIL_CLOSED: Simulation persistence is strictly prohibited in PRODUCTION and REAL_DISCORD_PREVIEW modes.');
    }
  }

  private getStore(collectionName: string): Map<string, any> {
    if (config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW') {
      throw new Error('FAIL_CLOSED: In-memory simulation persistence is prohibited in production runtime modes.');
    }
    let store = this.memoryStores.get(collectionName);
    if (!store) {
      store = new Map();
      this.memoryStores.set(collectionName, store);
    }
    return store;
  }

  async getById<T extends { id: string }>(collectionName: string, id: string): Promise<T | null> {
    const store = this.getStore(collectionName);
    return store.get(id) || null;
  }

  async list<T extends { id: string }>(collectionName: string, options?: QueryOptions): Promise<T[]> {
    const store = this.getStore(collectionName);
    let items = Array.from(store.values());

    if (options?.where && options.where.length > 0) {
      for (const filter of options.where) {
        items = items.filter((item) => {
          const val = item[filter.field];
          if (filter.operator === '==') return val === filter.value;
          if (filter.operator === '!=') return val !== filter.value;
          return true;
        });
      }
    }

    if (options?.limit) {
      items = items.slice(options.offset || 0, (options.offset || 0) + options.limit);
    }

    return items;
  }

  async create<T extends { id: string }>(collectionName: string, id: string, data: any): Promise<T> {
    const store = this.getStore(collectionName);
    store.set(id, data);
    return data as T;
  }

  async update<T extends { id: string }>(collectionName: string, id: string, updates: Partial<T>): Promise<T> {
    const store = this.getStore(collectionName);
    const existing = store.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found in collection ${collectionName}`);
    }
    const updated = { ...existing, ...updates };
    store.set(id, updated);
    return updated as T;
  }

  async upsert<T extends { id: string }>(collectionName: string, id: string, data: any): Promise<T> {
    const store = this.getStore(collectionName);
    const existing = store.get(id);
    if (existing) {
      const updated = { ...existing, ...data };
      store.set(id, updated);
      return updated as T;
    } else {
      store.set(id, data);
      return data as T;
    }
  }

  async delete(collectionName: string, id: string): Promise<boolean> {
    const store = this.getStore(collectionName);
    return store.delete(id);
  }

  async count(collectionName: string, options?: QueryOptions): Promise<number> {
    const store = this.getStore(collectionName);
    if (!options?.where || options.where.length === 0) {
      return store.size;
    }
    const filtered = await this.list(collectionName, options);
    return filtered.length;
  }
}

// Select active provider
const isRealPersistence = config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW';

export class PostgresPersistenceProvider implements IPersistenceProvider {
  getById<T extends { id: string }>(c: string, id: string) { return postgresStore.getById(c, id) as Promise<T | null>; }
  list<T extends { id: string }>(c: string, o?: QueryOptions) { return postgresStore.list(c, o) as Promise<T[]>; }
  create<T extends { id: string }>(c: string, id: string, data: any) { return postgresStore.set(c, id, data) as Promise<T>; }
  update<T extends { id: string }>(c: string, id: string, u: Partial<T>) { return postgresStore.update(c, id, u) as Promise<T>; }
  upsert<T extends { id: string }>(c: string, id: string, data: any) { return postgresStore.upsert(c, id, data) as Promise<T>; }
  delete(c: string, id: string) { return postgresStore.delete(c, id); }
  count(c: string, o?: QueryOptions) { return postgresStore.count(c, o); }
}

export const activePersistenceProvider: IPersistenceProvider = isPostgresEnabled()
  ? new PostgresPersistenceProvider()
  : isRealPersistence
    ? new FirestorePersistenceProvider()
    : new DevelopmentSimulationPersistenceProvider();
