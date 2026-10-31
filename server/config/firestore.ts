import { Firestore } from '@google-cloud/firestore';
import { config } from './env.js';
import { sanitizeFirestoreDatabaseId, getFirestoreDb as getRepositoryFirestoreDb } from '../repositories/firestore.repository.js';

let localDbInstance: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  const instance = getRepositoryFirestoreDb();
  if (instance) {
    return instance;
  }
  if (localDbInstance) return localDbInstance;
  const projectId = config.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'community-manager-bot-508316';
  const databaseId = sanitizeFirestoreDatabaseId(config.FIRESTORE_DATABASE_ID);
  
  localDbInstance = new Firestore({
    projectId,
    ...(databaseId ? { databaseId } : {}),
  });
  return localDbInstance;
}

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const active = getFirestoreDb();
    const val = Reflect.get(active, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  },
});

