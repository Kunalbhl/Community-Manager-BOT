import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';

export interface FirebaseClientPublicConfig {
  apiKey?: string;
  projectId?: string;
  appId?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  firestoreDatabaseId?: string;
}

/**
 * Validates that the configuration is genuinely provided and not a placeholder or dummy.
 */
export function isGenuineFirebaseConfig(config: FirebaseClientPublicConfig | null | undefined): boolean {
  if (!config) return false;
  const { apiKey, projectId, appId } = config;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') return false;
  if (!projectId || typeof projectId !== 'string' || projectId.trim() === '') return false;
  if (!appId || typeof appId !== 'string' || appId.trim() === '') return false;

  // Strict anti-fake checks: reject known placeholder / synthetic values
  const forbiddenPatterns = [
    'placeholder',
    'fake',
    'dummy',
    'sample',
    'test-key',
    'undefined',
  ];

  const lowerApiKey = apiKey.toLowerCase();
  const lowerAppId = appId.toLowerCase();
  const lowerProjectId = projectId.toLowerCase();

  for (const pattern of forbiddenPatterns) {
    if (lowerApiKey.includes(pattern) || lowerAppId.includes(pattern) || lowerProjectId.includes(pattern)) {
      return false;
    }
  }

  // Real Firebase API keys typically start with AIza and are at least 20 characters long
  if (!apiKey.startsWith('AIza') || apiKey.length < 20) {
    return false;
  }

  return true;
}

/**
 * Resolves browser public configuration strictly from environment or window globals.
 * Never manufactures defaults or fake credentials.
 */
export function resolveBrowserFirebaseConfig(): FirebaseClientPublicConfig | null {
  const env = typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;
  const globalObj = typeof window !== 'undefined' ? (window as any).__FIREBASE_CONFIG__ : undefined;

  const candidate: FirebaseClientPublicConfig = {
    apiKey: env?.VITE_FIREBASE_API_KEY || globalObj?.apiKey,
    projectId: env?.VITE_FIREBASE_PROJECT_ID || globalObj?.projectId,
    appId: env?.VITE_FIREBASE_APP_ID || globalObj?.appId,
    authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || globalObj?.authDomain,
    storageBucket: env?.VITE_FIREBASE_STORAGE_BUCKET || globalObj?.storageBucket,
    messagingSenderId: env?.VITE_FIREBASE_MESSAGING_SENDER_ID || globalObj?.messagingSenderId,
    firestoreDatabaseId: env?.VITE_FIREBASE_DATABASE_ID || globalObj?.firestoreDatabaseId,
  };

  if (isGenuineFirebaseConfig(candidate)) {
    return candidate;
  }

  return null;
}

export function isFirebaseClientConfigured(): boolean {
  return Boolean(resolveBrowserFirebaseConfig());
}

let initializedApp: FirebaseApp | null = null;
let initializedDb: Firestore | null = null;
let initializedAuth: Auth | null = null;

function ensureInitialized(): void {
  const config = resolveBrowserFirebaseConfig();
  if (!config) {
    return;
  }
  if (!initializedApp) {
    try {
      const existingApps = getApps();
      initializedApp = existingApps.length > 0 ? existingApps[0] : initializeApp(config as FirebaseOptions);
      initializedDb = initializeFirestore(
        initializedApp,
        { experimentalForceLongPolling: true },
        config.firestoreDatabaseId
      );
      initializedAuth = getAuth(initializedApp);
    } catch (err) {
      console.warn('[FirebaseClient] Initialization failed with provided config:', err);
      initializedApp = null;
      initializedDb = null;
      initializedAuth = null;
    }
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseClientConfigured()) {
    throw new Error('NOT_CONFIGURED: Firebase client is not configured in this environment.');
  }
  ensureInitialized();
  if (!initializedApp) {
    throw new Error('NOT_CONFIGURED: Firebase app failed to initialize.');
  }
  return initializedApp;
}

export function getFirebaseDb(): Firestore {
  if (!isFirebaseClientConfigured()) {
    throw new Error('NOT_CONFIGURED: Firebase Firestore is not configured in this environment.');
  }
  ensureInitialized();
  if (!initializedDb) {
    throw new Error('NOT_CONFIGURED: Firebase Firestore failed to initialize.');
  }
  return initializedDb;
}

export function getFirebaseAuth(): Auth {
  if (!isFirebaseClientConfigured()) {
    throw new Error('NOT_CONFIGURED: Firebase Auth is not configured in this environment.');
  }
  ensureInitialized();
  if (!initializedAuth) {
    throw new Error('NOT_CONFIGURED: Firebase Auth failed to initialize.');
  }
  return initializedAuth;
}

/**
 * Compatibility exports:
 * If not configured, db and auth are null.
 */
export const db: Firestore | null = initializedDb;
export const auth: Auth | null = initializedAuth;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const currentAuth = initializedAuth;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.currentUser?.uid,
      email: currentAuth?.currentUser?.email,
      emailVerified: currentAuth?.currentUser?.emailVerified,
      isAnonymous: currentAuth?.currentUser?.isAnonymous,
      tenantId: currentAuth?.currentUser?.tenantId,
      providerInfo: currentAuth?.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<string> {
  if (!isFirebaseClientConfigured()) {
    return 'NOT_CONFIGURED';
  }
  ensureInitialized();
  if (!initializedDb) {
    return 'NOT_CONFIGURED';
  }
  try {
    await getDocFromServer(doc(initializedDb, 'test', 'connection'));
    return 'CONNECTED';
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline. Verify network connection and project rules.');
    }
    return 'ERROR';
  }
}

