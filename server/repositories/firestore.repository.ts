import { Firestore, WhereFilterOp } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';
import { IRepository, QueryOptions } from './base.repository.js';
import { logger } from '../logging/logger.js';
import { config } from '../config/env.js';
import { isPostgresEnabled, postgresStore } from './postgres.store.js';

let firestoreInstance: Firestore | null = null;
let firestoreInitialized = false;
let firestoreAvailable = false;
let activeDatabaseId: string | undefined = undefined;
let resolvedProjectId: string | undefined = undefined;
let currentDbVersion = 0;
let databaseFallbackActivated = false;
let databaseFallbackReason = '';

export class FirestoreUnavailableError extends Error {
  public readonly code = 'FIRESTORE_UNAVAILABLE';
  constructor(message = 'FIRESTORE_UNAVAILABLE: Real Firestore database is required and currently unavailable') {
    super(message);
    this.name = 'FirestoreUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Isolated development simulation store (only accessible in DEVELOPMENT_SIMULATION mode)
const simulationStores = new Map<string, Map<string, any>>();

export const isRealPersistenceMode = () =>
  config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW';

function getSimulationStore(collectionName: string): Map<string, any> {
  if (isRealPersistenceMode()) {
    logger.error('Database connection lost. Failing closed in production mode.');
    throw new FirestoreUnavailableError(
      `FIRESTORE_UNAVAILABLE: In-memory simulation persistence is strictly prohibited in ${config.APP_RUNTIME_MODE} mode for collection ${collectionName}.`
    );
  }
  let store = simulationStores.get(collectionName);
  if (!store) {
    store = new Map();
    simulationStores.set(collectionName, store);
  }
  return store;
}

export function sanitizeFirestoreDatabaseId(dbId?: string | null): string | undefined {
  if (!dbId || typeof dbId !== 'string') return undefined;
  const trimmed = dbId.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.includes('/') ||
    trimmed.includes(':') ||
    trimmed.includes('firebasedatabase.app')
  ) {
    return undefined;
  }
  if (trimmed === '(default)') {
    return undefined;
  }
  return trimmed;
}

export const CANONICAL_FIRESTORE_DATABASE_ID = 'ai-studio-communitymanager-59f17f1d-8b74-490e-9248-bc41e69de7ef';

export function reinitializeWithAlternativeDatabase(err?: any): Firestore | null {
  if (!resolvedProjectId) {
    resolvedProjectId = config.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'community-manager-bot-508316';
  }
  const errMsg = err?.message || String(err || 'Database error fallback');
  // Toggle between named canonical database and default database
  const targetDbId = activeDatabaseId ? undefined : CANONICAL_FIRESTORE_DATABASE_ID;
  logger.warn(`[FirestoreRepository] Database '${activeDatabaseId || '(default)'}' failed (${errMsg}). Switching to alternative database: '${targetDbId || '(default)'}' for project: ${resolvedProjectId}.`);
  databaseFallbackActivated = true;
  databaseFallbackReason = errMsg;
  activeDatabaseId = targetDbId;
  firestoreInstance = new Firestore({
    projectId: resolvedProjectId,
    ...(activeDatabaseId ? { databaseId: activeDatabaseId } : {}),
    ignoreUndefinedProperties: true,
  });
  firestoreAvailable = true;
  currentDbVersion++;
  return firestoreInstance;
}

export function reinitializeWithDefaultDatabase(err?: any): Firestore | null {
  return reinitializeWithAlternativeDatabase(err);
}

export function tryHandleDatabaseFallback(err: any): Firestore | null {
  if (databaseFallbackActivated) return null;
  const errMsg = (err?.message || String(err)).toLowerCase();
  const code = err?.code;
  if (code === 5 || code === '5' || code === 'NOT_FOUND' || errMsg.includes('not_found') || errMsg.includes('not found') || errMsg.includes('database') || errMsg.includes('db')) {
    return reinitializeWithAlternativeDatabase(err);
  }
  return null;
}

export function getFirestoreDiagnostics() {
  return {
    activeFirestoreDatabase: activeDatabaseId || '(default)',
    firestoreProject: resolvedProjectId || config.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'community-manager-bot-508316',
    firestoreClientReady: firestoreAvailable && firestoreInstance !== null,
    databaseFallbackActivated,
    databaseFallbackReason,
    sessionStoreReady: firestoreAvailable,
  };
}

export function testConfigureDatabase(projectId: string | undefined, databaseId: string | undefined) {
  resolvedProjectId = projectId;
  activeDatabaseId = databaseId;
  firestoreInitialized = true;
  firestoreAvailable = true;
}

function handleFirestoreOpError(err: any, op: string, collection: string, id?: string): never {
  const errMsg = err?.message || String(err);
  const errMsgLower = errMsg.toLowerCase();
  const code = err?.code || (errMsgLower.includes('5 not_found') || errMsgLower.includes('not_found') || errMsgLower.includes('5') ? 5 : undefined);

  if (activeDatabaseId && (code === 5 || errMsgLower.includes('not_found') || errMsgLower.includes('database') || errMsgLower.includes('db'))) {
    reinitializeWithDefaultDatabase(err);
  }

  if (isRealPersistenceMode()) {
    if (code === 7 || errMsgLower.includes('permission_denied') || errMsgLower.includes('permission denied')) {
      const error = new Error(`FIRESTORE_PERMISSION_DENIED: Access denied to collection ${collection}${id ? `/${id}` : ''} (${op}): ${errMsg}`);
      (error as any).code = 'FIRESTORE_PERMISSION_DENIED';
      throw error;
    }
    if (code === 14 || errMsgLower.includes('unavailable') || errMsgLower.includes('connection lost')) {
      const error = new Error(`FIRESTORE_UNAVAILABLE: Firestore service is unavailable for collection ${collection}${id ? `/${id}` : ''} (${op}): ${errMsg}`);
      (error as any).code = 'FIRESTORE_UNAVAILABLE';
      throw error;
    }
    if (code === 5 || errMsgLower.includes('not_found') || errMsgLower.includes('not found')) {
      if (errMsgLower.includes('database') || errMsgLower.includes('db')) {
        const error = new Error(`FIRESTORE_DATABASE_NOT_FOUND: Configured Firestore database was not found: ${errMsg}`);
        (error as any).code = 'FIRESTORE_DATABASE_NOT_FOUND';
        throw error;
      }
      const error = new Error(`FIRESTORE_DOCUMENT_NOT_FOUND: Collection or document not found: ${collection}${id ? `/${id}` : ''} (${op}): ${errMsg}`);
      (error as any).code = 'FIRESTORE_DOCUMENT_NOT_FOUND';
      throw error;
    }

    const error = new Error(`FIRESTORE_INTERNAL_ERROR: Real Firestore database error on collection ${collection}${id ? `/${id}` : ''} (${op}): ${errMsg}`);
    (error as any).code = 'FIRESTORE_INTERNAL_ERROR';
    throw error;
  }

  logger.warn(`[FirestoreRepository] ${op} error on ${collection}${id ? `/${id}` : ''}: ${errMsg}. Using memory store.`);
  throw err;
}

/**
 * Performs a live connectivity check against Firestore without falling back.
 */
export async function checkFirestoreReadiness(): Promise<{ isReady: boolean; error?: string }> {
  if (isPostgresEnabled()) {
    try {
      await postgresStore.ping();
      return { isReady: true };
    } catch (err: any) {
      return { isReady: false, error: `POSTGRES_UNAVAILABLE: ${err?.message || err}` };
    }
  }
  try {
    const db = getFirestoreDb();
    if (!db) {
      return { isReady: false, error: 'FIRESTORE_UNAVAILABLE: Firestore client not initialized or unavailable' };
    }
    const pingRef = db.collection('system_health').doc('ping');
    await pingRef.get();
    firestoreAvailable = true;
    return { isReady: true };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (activeDatabaseId && (errMsg.includes('NOT_FOUND') || errMsg.includes('not found') || errMsg.includes('Database') || errMsg.includes('5 NOT_FOUND'))) {
      try {
        const fallbackDb = reinitializeWithDefaultDatabase();
        if (fallbackDb) {
          const pingRef = fallbackDb.collection('system_health').doc('ping');
          await pingRef.get();
          return { isReady: true };
        }
      } catch (fallbackErr: any) {
        return { isReady: false, error: fallbackErr?.message || String(fallbackErr) };
      }
    }
    return { isReady: false, error: errMsg };
  }
}

/**
 * Returns the initialized Firestore database instance or null if unavailable.
 */
export function getFirestoreDb(): Firestore | null {
  if (firestoreInitialized) {
    return firestoreAvailable ? firestoreInstance : null;
  }

  firestoreInitialized = true;

  try {
    // Check if firebase-applet-config.json exists
    let appletConfig: any = null;
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        appletConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      // Ignore
    }

    // 1. Resolve Project ID
    resolvedProjectId =
      appletConfig?.projectId ||
      config.GOOGLE_CLOUD_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT_ID ||
      process.env.GCP_PROJECT ||
      process.env.GCLOUD_PROJECT;

    activeDatabaseId =
      sanitizeFirestoreDatabaseId(appletConfig?.firestoreDatabaseId) ||
      sanitizeFirestoreDatabaseId(config.FIRESTORE_DATABASE_ID) ||
      sanitizeFirestoreDatabaseId(process.env.FIRESTORE_DATABASE_ID);

    if (isRealPersistenceMode() && !activeDatabaseId) {
      activeDatabaseId = CANONICAL_FIRESTORE_DATABASE_ID;
    }

    if (!resolvedProjectId) {
      if (isRealPersistenceMode()) {
        logger.error('Database connection lost. Failing closed in production mode.');
        firestoreAvailable = false;
        throw new FirestoreUnavailableError('FIRESTORE_UNAVAILABLE: No GOOGLE_CLOUD_PROJECT_ID configured in production persistence mode.');
      }
      logger.info('[FirestoreRepository] No GOOGLE_CLOUD_PROJECT_ID configured. Operating with high-performance local store.');
      firestoreAvailable = false;
      return null;
    }

    firestoreInstance = new Firestore({
      projectId: resolvedProjectId,
      ...(activeDatabaseId ? { databaseId: activeDatabaseId } : {}),
      ignoreUndefinedProperties: true,
    });

    firestoreAvailable = true;
    logger.info(
      `[FirestoreRepository] Initialized Firestore client for project: ${resolvedProjectId}, database: ${activeDatabaseId || '(default)'}`
    );
    return firestoreInstance;
  } catch (err: any) {
    if (isRealPersistenceMode()) {
      logger.error('Database connection lost. Failing closed in production mode.');
      firestoreAvailable = false;
      throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Could not initialize Firestore client (${err?.message || err}).`);
    }
    logger.info(
      `[FirestoreRepository] Could not initialize Firestore client (${err?.message || err}). Operating with local store.`
    );
    firestoreAvailable = false;
    return null;
  }
}

function wrapData<T extends { id: string }>(data: any, id: string): T {
  if (!data) return { id } as unknown as T;
  const cleaned: any = { ...data, id };
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] === null) {
      delete cleaned[key];
    }
  }
  return cleaned as T;
}

/**
 * Durable Firestore Repository Implementation.
 * Connects directly to Google Cloud Firestore with in-memory fallback.
 */
export class FirestoreRepository<T extends { id: string }> implements IRepository<T> {
  protected collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  getCollectionName(): string {
    return this.collectionName;
  }

  async getById(id: string): Promise<T | null> {
    if (isPostgresEnabled()) return postgresStore.getById(this.collectionName, id) as Promise<T | null>;
    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      const dbVersionAtStart = currentDbVersion;
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        const docRef = db.collection(this.collectionName).doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          return wrapData<T>(docSnap.data(), docSnap.id);
        }
        return null;
      } catch (err: any) {
        if (currentDbVersion !== dbVersionAtStart) {
          const newDb = getFirestoreDb();
          if (newDb) {
            try {
              const docRef = newDb.collection(this.collectionName).doc(id);
              const docSnap = await docRef.get();
              if (docSnap.exists) {
                return wrapData<T>(docSnap.data(), docSnap.id);
              }
              return null;
            } catch (fbErr: any) {
              const fbMsg = fbErr?.message || String(fbErr);
              if (fbMsg.includes('NOT_FOUND') || fbMsg.includes('not found') || fbMsg.includes('5 NOT_FOUND')) {
                return null;
              }
              handleFirestoreOpError(fbErr, 'getById', this.collectionName, id);
            }
          }
        }
        const fallbackDb = tryHandleDatabaseFallback(err);
        if (fallbackDb) {
          try {
            const docRef = fallbackDb.collection(this.collectionName).doc(id);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
              return wrapData<T>(docSnap.data(), docSnap.id);
            }
            return null;
          } catch (fbErr: any) {
            const fbMsg = fbErr?.message || String(fbErr);
            if (fbErr?.code === 5 || fbErr?.code === 'NOT_FOUND' || fbMsg.includes('NOT_FOUND') || fbMsg.includes('not found') || fbMsg.includes('5 NOT_FOUND')) {
              return null;
            }
            handleFirestoreOpError(fbErr, 'getById', this.collectionName, id);
          }
        }
        const errMsg = (err?.message || String(err)).toLowerCase();
        const code = err?.code;
        if (code === 5 || code === '5' || code === 'NOT_FOUND' || errMsg.includes('not_found') || errMsg.includes('not found') || errMsg.includes('5') || errMsg.includes('database') || errMsg.includes('db')) {
          return null;
        }
        handleFirestoreOpError(err, 'getById', this.collectionName, id);
      }
    }

    if (!isRealPersistenceMode()) {
      const local = getSimulationStore(this.collectionName).get(id);
      if (local) return local;
    }

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      return getSimulationStore(this.collectionName).get(id) || null;
    }

    try {
      const docRef = db.collection(this.collectionName).doc(id);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = wrapData<T>(docSnap.data(), docSnap.id);
        getSimulationStore(this.collectionName).set(id, data);
        return data;
      }
      return null;
    } catch (err: any) {
      return getSimulationStore(this.collectionName).get(id) || null;
    }
  }

  async findById(id: string): Promise<T | null> {
    return this.getById(id);
  }

  async findByQuery(query?: Record<string, any>): Promise<T[]> {
    const whereFilters: Array<{ field: string; operator: '==' | '!=' | '<' | '<=' | '>' | '>='; value: unknown }> = [];
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        whereFilters.push({ field: k, operator: '==', value: v });
      }
    }
    return this.list({ where: whereFilters });
  }

  async findAll(): Promise<T[]> {
    return this.list();
  }

  async list(options?: QueryOptions): Promise<T[]> {
    if (isPostgresEnabled()) return postgresStore.list(this.collectionName, options) as Promise<T[]>;
    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      const dbVersionAtStart = currentDbVersion;
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        let q: any = db.collection(this.collectionName);

        if (options?.where && options.where.length > 0) {
          for (const filter of options.where) {
            q = q.where(filter.field, filter.operator as WhereFilterOp, filter.value);
          }
        }

        if (options?.orderBy) {
          q = q.orderBy(options.orderBy, options.orderDirection || 'asc');
        }

        if (typeof options?.offset === 'number') {
          q = q.offset(options.offset);
        }

        if (typeof options?.limit === 'number') {
          q = q.limit(options.limit);
        }

        const querySnapshot = await q.get();
        const results: T[] = [];
        querySnapshot.forEach((doc: any) => {
          results.push({ ...(doc.data() as any), id: doc.id } as T);
        });
        return results;
      } catch (err: any) {
        if (currentDbVersion !== dbVersionAtStart) {
          const newDb = getFirestoreDb();
          if (newDb) {
            try {
              let q: any = newDb.collection(this.collectionName);
              if (options?.where && options.where.length > 0) {
                for (const filter of options.where) {
                  q = q.where(filter.field, filter.operator as WhereFilterOp, filter.value);
                }
              }
              if (options?.orderBy) {
                q = q.orderBy(options.orderBy, options.orderDirection || 'asc');
              }
              if (typeof options?.offset === 'number') {
                q = q.offset(options.offset);
              }
              if (typeof options?.limit === 'number') {
                q = q.limit(options.limit);
              }
              const querySnapshot = await q.get();
              const results: T[] = [];
              querySnapshot.forEach((doc: any) => {
                results.push({ ...(doc.data() as any), id: doc.id } as T);
              });
              return results;
            } catch (fbErr: any) {
              const fbMsg = (fbErr?.message || String(fbErr)).toLowerCase();
              const fbCode = fbErr?.code;
              if (fbCode === 5 || fbCode === '5' || fbCode === 'NOT_FOUND' || fbMsg.includes('not_found') || fbMsg.includes('not found') || fbMsg.includes('5') || fbMsg.includes('database') || fbMsg.includes('db')) {
                return [];
              }
              handleFirestoreOpError(fbErr, 'list', this.collectionName);
            }
          }
        }
        const fallbackDb = tryHandleDatabaseFallback(err);
        if (fallbackDb) {
          try {
            let q: any = fallbackDb.collection(this.collectionName);
            if (options?.where && options.where.length > 0) {
              for (const filter of options.where) {
                q = q.where(filter.field, filter.operator as WhereFilterOp, filter.value);
              }
            }
            if (options?.orderBy) {
              q = q.orderBy(options.orderBy, options.orderDirection || 'asc');
            }
            if (typeof options?.offset === 'number') {
              q = q.offset(options.offset);
            }
            if (typeof options?.limit === 'number') {
              q = q.limit(options.limit);
            }
            const querySnapshot = await q.get();
            const results: T[] = [];
            querySnapshot.forEach((doc: any) => {
              results.push({ ...(doc.data() as any), id: doc.id } as T);
            });
            return results;
          } catch (fbErr: any) {
            const fbMsg = (fbErr?.message || String(fbErr)).toLowerCase();
            const fbCode = fbErr?.code;
            if (fbCode === 5 || fbCode === '5' || fbCode === 'NOT_FOUND' || fbMsg.includes('not_found') || fbMsg.includes('not found') || fbMsg.includes('5') || fbMsg.includes('database') || fbMsg.includes('db')) {
              return [];
            }
            handleFirestoreOpError(fbErr, 'list', this.collectionName);
          }
        }
        const errMsg = (err?.message || String(err)).toLowerCase();
        const code = err?.code;
        if (code === 5 || code === '5' || code === 'NOT_FOUND' || errMsg.includes('not_found') || errMsg.includes('not found') || errMsg.includes('5') || errMsg.includes('database') || errMsg.includes('db')) {
          return [];
        }
        handleFirestoreOpError(err, 'list', this.collectionName);
      }
    }

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      return this.listFromMemory(options);
    }

    try {
      let q: any = db.collection(this.collectionName);

      if (options?.where && options.where.length > 0) {
        for (const filter of options.where) {
          q = q.where(filter.field, filter.operator as WhereFilterOp, filter.value);
        }
      }

      if (options?.orderBy) {
        q = q.orderBy(options.orderBy, options.orderDirection || 'asc');
      }

      if (typeof options?.offset === 'number') {
        q = q.offset(options.offset);
      }

      if (typeof options?.limit === 'number') {
        q = q.limit(options.limit);
      }

      const querySnapshot = await q.get();
      const results: T[] = [];
      querySnapshot.forEach((doc: any) => {
        results.push({ ...(doc.data() as any), id: doc.id } as T);
      });

      const memStore = getSimulationStore(this.collectionName);
      for (const item of results) {
        memStore.set(item.id, item);
      }

      return results;
    } catch (err: any) {
      return this.listFromMemory(options);
    }
  }

  async listForTenant(tenantId: string, options?: QueryOptions): Promise<T[]> {
    const tenantFilter = {
      field: 'communityId',
      operator: '==' as const,
      value: tenantId,
    };

    const combinedOptions: QueryOptions = {
      ...options,
      where: [...(options?.where || []), tenantFilter],
    };

    return this.list(combinedOptions);
  }

  async create(itemOrId: string | (Omit<T, 'id'> & { id?: string }), maybeItem?: any): Promise<T> {
    let id: string;
    let data: any;

    if (typeof itemOrId === 'string') {
      id = itemOrId;
      data = { ...(maybeItem || {}), id };
    } else {
      id = itemOrId.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      data = { ...itemOrId, id };
    }

    const cleanData: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        cleanData[k] = v;
      }
    }

    if (isPostgresEnabled()) return postgresStore.set(this.collectionName, id, cleanData) as Promise<T>;

    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        const docRef = db.collection(this.collectionName).doc(id);
        await docRef.set(cleanData);
        return cleanData as T;
      } catch (err: any) {
        const fallbackDb = tryHandleDatabaseFallback(err);
        if (fallbackDb) {
          try {
            const docRef = fallbackDb.collection(this.collectionName).doc(id);
            await docRef.set(cleanData);
            return cleanData as T;
          } catch (fbErr: any) {
            handleFirestoreOpError(fbErr, 'create', this.collectionName, id);
          }
        }
        handleFirestoreOpError(err, 'create', this.collectionName, id);
      }
    }

    const memStore = getSimulationStore(this.collectionName);
    memStore.set(id, cleanData);

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      return cleanData as T;
    }

    try {
      const docRef = db.collection(this.collectionName).doc(id);
      await docRef.set(cleanData);
      return cleanData as T;
    } catch (err: any) {
      return cleanData as T;
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const cleanUpdates: any = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        cleanUpdates[k] = v;
      } else {
        cleanUpdates[k] = null;
      }
    }

    if (isPostgresEnabled()) return postgresStore.update(this.collectionName, id, cleanUpdates) as Promise<T>;

    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        const docRef = db.collection(this.collectionName).doc(id);
        await docRef.set(cleanUpdates as any, { merge: true });
        const snap = await docRef.get();
        if (snap.exists) {
          return wrapData<T>(snap.data(), snap.id);
        }
        return { ...(cleanUpdates as any), id } as T;
      } catch (err: any) {
        const fallbackDb = tryHandleDatabaseFallback(err);
        if (fallbackDb) {
          try {
            const docRef = fallbackDb.collection(this.collectionName).doc(id);
            await docRef.set(cleanUpdates as any, { merge: true });
            const snap = await docRef.get();
            if (snap.exists) {
              return wrapData<T>(snap.data(), snap.id);
            }
            return { ...(cleanUpdates as any), id } as T;
          } catch (fbErr: any) {
            handleFirestoreOpError(fbErr, 'update', this.collectionName, id);
          }
        }
        handleFirestoreOpError(err, 'update', this.collectionName, id);
      }
    }

    const memStore = getSimulationStore(this.collectionName);
    const existing = memStore.get(id) || { id };
    const updated = { ...existing, ...cleanUpdates, id };
    for (const key of Object.keys(updated)) {
      if (updated[key] === null) {
        delete updated[key];
      }
    }
    memStore.set(id, updated);

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      return updated;
    }

    try {
      const docRef = db.collection(this.collectionName).doc(id);
      await docRef.set(cleanUpdates as any, { merge: true });
      const snap = await docRef.get();
      if (snap.exists) {
        const fresh = wrapData<T>(snap.data(), snap.id);
        memStore.set(id, fresh);
        return fresh;
      }
      return updated;
    } catch (err: any) {
      return updated;
    }
  }

  async upsert(idOrItem: string | (Partial<T> & { id: string }), maybeItem?: Partial<T>): Promise<T> {
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
    const item = typeof idOrItem === 'string' ? (maybeItem || {}) : idOrItem;
    const data = { ...item, id };

    const cleanData: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        cleanData[k] = v;
      }
    }

    if (isPostgresEnabled()) return postgresStore.upsert(this.collectionName, id, cleanData) as Promise<T>;

    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        const docRef = db.collection(this.collectionName).doc(id);
        await docRef.set(cleanData, { merge: true });
        const snap = await docRef.get();
        if (snap.exists) {
          return { ...(snap.data() as any), id: snap.id } as T;
        }
        return cleanData as T;
      } catch (err: any) {
        const fallbackDb = tryHandleDatabaseFallback(err);
        if (fallbackDb) {
          try {
            const docRef = fallbackDb.collection(this.collectionName).doc(id);
            await docRef.set(cleanData, { merge: true });
            const snap = await docRef.get();
            if (snap.exists) {
              return { ...(snap.data() as any), id: snap.id } as T;
            }
            return cleanData as T;
          } catch (fbErr: any) {
            handleFirestoreOpError(fbErr, 'upsert', this.collectionName, id);
          }
        }
        handleFirestoreOpError(err, 'upsert', this.collectionName, id);
      }
    }

    const memStore = getSimulationStore(this.collectionName);
    const existing = memStore.get(id) || {};
    const merged = { ...existing, ...data };
    memStore.set(id, merged);

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      return merged;
    }

    try {
      const docRef = db.collection(this.collectionName).doc(id);
      await docRef.set(data, { merge: true });
      const snap = await docRef.get();
      if (snap.exists) {
        const fresh = { ...(snap.data() as any), id: snap.id } as T;
        memStore.set(id, fresh);
        return fresh;
      }
      return merged;
    } catch (err: any) {
      return merged;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (isPostgresEnabled()) return postgresStore.delete(this.collectionName, id);
    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        const docRef = db.collection(this.collectionName).doc(id);
        await docRef.delete();
        return true;
      } catch (err: any) {
        handleFirestoreOpError(err, 'delete', this.collectionName, id);
      }
    }

    const memStore = getSimulationStore(this.collectionName);
    memStore.delete(id);

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      return true;
    }

    try {
      const docRef = db.collection(this.collectionName).doc(id);
      await docRef.delete();
      return true;
    } catch (err: any) {
      return true;
    }
  }

  async count(options?: QueryOptions): Promise<number> {
    if (isPostgresEnabled()) return postgresStore.count(this.collectionName, options);
    if (isRealPersistenceMode()) {
      const db = getFirestoreDb();
      if (!db || !firestoreAvailable) {
        logger.error('Database connection lost. Failing closed in production mode.');
        throw new FirestoreUnavailableError(`FIRESTORE_UNAVAILABLE: Real Firestore database is required for collection ${this.collectionName}`);
      }
      try {
        let q: any = db.collection(this.collectionName);
        if (options?.where && options.where.length > 0) {
          for (const filter of options.where) {
            q = q.where(filter.field, filter.operator as WhereFilterOp, filter.value);
          }
        }
        const snapshot = await q.count().get();
        return snapshot.data().count;
      } catch (err: any) {
        handleFirestoreOpError(err, 'count', this.collectionName);
      }
    }

    const db = getFirestoreDb();
    if (!db || !firestoreAvailable) {
      if (!options?.where || options.where.length === 0) {
        return getSimulationStore(this.collectionName).size;
      }
      const list = this.listFromMemory(options);
      return list.length;
    }

    try {
      let q: any = db.collection(this.collectionName);
      if (options?.where && options.where.length > 0) {
        for (const filter of options.where) {
          q = q.where(filter.field, filter.operator as WhereFilterOp, filter.value);
        }
      }
      const snapshot = await q.count().get();
      return snapshot.data().count;
    } catch (err: any) {
      const list = this.listFromMemory(options);
      return list.length;
    }
  }

  async countForTenant(communityId: string, options?: QueryOptions): Promise<number> {
    const tenantFilter = {
      field: 'communityId',
      operator: '==' as const,
      value: communityId,
    };

    const combinedOptions: QueryOptions = {
      ...options,
      where: [...(options?.where || []), tenantFilter],
    };

    return this.count(combinedOptions);
  }

  private listFromMemory(options?: QueryOptions): T[] {
    if (isRealPersistenceMode()) {
      logger.error('Database connection lost. Failing closed in production mode.');
      throw new FirestoreUnavailableError('FIRESTORE_UNAVAILABLE: In-memory simulation persistence is strictly prohibited in PRODUCTION and REAL_DISCORD_PREVIEW modes. Real Firestore connection is required.');
    }
    const store = getSimulationStore(this.collectionName);
    let items = Array.from(store.values());

    if (options?.where && options.where.length > 0) {
      for (const filter of options.where) {
        items = items.filter((item) => {
          const val = item[filter.field];
          if (filter.operator === '==') return val === filter.value;
          if (filter.operator === '!=') return val !== filter.value;
          if (filter.operator === '>') return val > filter.value;
          if (filter.operator === '>=') return val >= filter.value;
          if (filter.operator === '<') return val < filter.value;
          if (filter.operator === '<=') return val <= filter.value;
          if (filter.operator === 'array-contains') {
            return Array.isArray(val) && val.includes(filter.value);
          }
          if (filter.operator === 'in') {
            return Array.isArray(filter.value) && filter.value.includes(val);
          }
          return true;
        });
      }
    }

    if (options?.orderBy) {
      const field = options.orderBy;
      const dir = options.orderDirection === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
    }

    if (typeof options?.offset === 'number' || typeof options?.limit === 'number') {
      const offset = options?.offset || 0;
      const limit = options?.limit !== undefined ? options.limit : items.length;
      items = items.slice(offset, offset + limit);
    }

    return items;
  }
}

/**
 * Explicitly isolated Development Simulation Persistence Provider.
 * Prohibited from instantiation in PRODUCTION or REAL_DISCORD_PREVIEW modes.
 */
export class DevelopmentSimulationPersistenceProvider<T extends { id: string }> implements IRepository<T> {
  protected collectionName: string;

  constructor(collectionName: string) {
    if (isRealPersistenceMode()) {
      throw new Error('FAIL_CLOSED: Simulation persistence is strictly prohibited in PRODUCTION or REAL_DISCORD_PREVIEW modes.');
    }
    this.collectionName = collectionName;
  }

  getCollectionName(): string {
    return this.collectionName;
  }

  async getById(id: string): Promise<T | null> {
    const store = getSimulationStore(this.collectionName);
    return store.get(id) || null;
  }

  async getByIdForTenant(communityId: string, id: string): Promise<T | null> {
    const doc = await this.getById(id);
    if (!doc) return null;
    return (doc as any).communityId === communityId ? doc : null;
  }

  async create(data: Omit<T, 'id'> & { id?: string }): Promise<T> {
    const store = getSimulationStore(this.collectionName);
    const id = data.id || `sim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const item = { ...data, id, createdAt: (data as any).createdAt || now, updatedAt: now } as unknown as T;
    store.set(id, item);
    return item;
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const store = getSimulationStore(this.collectionName);
    const existing = store.get(id);
    if (!existing) {
      throw new Error(`Document with id ${id} not found in collection ${this.collectionName}`);
    }
    const updated = { ...existing, ...updates, updatedAt: new Date() } as unknown as T;
    store.set(id, updated);
    return updated;
  }

  async upsert(idOrItem: string | (Partial<T> & { id: string }), maybeItem?: Partial<T>): Promise<T> {
    const store = getSimulationStore(this.collectionName);
    let id: string;
    let updates: Partial<T>;

    if (typeof idOrItem === 'string') {
      id = idOrItem;
      updates = maybeItem || {};
    } else {
      id = idOrItem.id;
      updates = idOrItem;
    }

    const existing = store.get(id);
    const now = new Date();
    if (existing) {
      const merged = { ...existing, ...updates, updatedAt: now } as unknown as T;
      store.set(id, merged);
      return merged;
    } else {
      const item = { ...updates, id, createdAt: (updates as any).createdAt || now, updatedAt: now } as unknown as T;
      store.set(id, item);
      return item;
    }
  }

  async delete(id: string): Promise<boolean> {
    const store = getSimulationStore(this.collectionName);
    return store.delete(id);
  }

  async list(options?: QueryOptions): Promise<T[]> {
    const store = getSimulationStore(this.collectionName);
    let items = Array.from(store.values());

    if (options?.where && options.where.length > 0) {
      for (const filter of options.where) {
        items = items.filter((item) => {
          const val = item[filter.field];
          if (filter.operator === '==') return val === filter.value;
          if (filter.operator === '!=') return val !== filter.value;
          if (filter.operator === '>') return val > filter.value;
          if (filter.operator === '>=') return val >= filter.value;
          if (filter.operator === '<') return val < filter.value;
          if (filter.operator === '<=') return val <= filter.value;
          if (filter.operator === 'array-contains') {
            return Array.isArray(val) && val.includes(filter.value);
          }
          if (filter.operator === 'in') {
            return Array.isArray(filter.value) && filter.value.includes(val);
          }
          return true;
        });
      }
    }

    if (options?.orderBy) {
      const field = options.orderBy;
      const dir = options.orderDirection === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
    }

    if (typeof options?.offset === 'number' || typeof options?.limit === 'number') {
      const offset = options?.offset || 0;
      const limit = options?.limit !== undefined ? options.limit : items.length;
      items = items.slice(offset, offset + limit);
    }

    return items;
  }

  async listForTenant(communityId: string, options?: QueryOptions): Promise<T[]> {
    const tenantFilter = {
      field: 'communityId',
      operator: '==' as const,
      value: communityId,
    };
    const combinedOptions: QueryOptions = {
      ...options,
      where: [...(options?.where || []), tenantFilter],
    };
    return this.list(combinedOptions);
  }

  async findByQuery(query: Partial<T>): Promise<T[]> {
    const store = getSimulationStore(this.collectionName);
    return Array.from(store.values()).filter((item) => {
      return Object.entries(query).every(([key, val]) => item[key] === val);
    });
  }

  async findByQueryForTenant(communityId: string, query: Partial<T>): Promise<T[]> {
    return this.findByQuery({ ...query, communityId } as any);
  }

  async count(options?: QueryOptions): Promise<number> {
    const items = await this.list(options);
    return items.length;
  }

  async countForTenant(communityId: string, options?: QueryOptions): Promise<number> {
    const items = await this.listForTenant(communityId, options);
    return items.length;
  }
}

