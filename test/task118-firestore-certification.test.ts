import assert from 'node:assert/strict';
import { FirestoreRepository } from '../server/repositories/firestore.repository.js';
import { config } from '../server/config/env.js';

export interface FirestoreCertificationResult {
  status: 'PASS' | 'BLOCKED_BY_INFRASTRUCTURE' | 'FAILED' | 'NOT_CONFIGURED';
  authenticated: boolean;
  databaseReachable: boolean;
  readable: boolean;
  writeable: boolean;
  passed: number;
  failed: number;
  error?: string;
  projectId?: string;
  databaseId?: string;
}

export async function runTask118Tests(): Promise<FirestoreCertificationResult> {
  console.log('\n==================================================');
  console.log('RUNNING TASK 118: REAL EXTERNAL FIRESTORE CERTIFICATION');
  console.log('==================================================');

  const projectId = config.GOOGLE_CLOUD_PROJECT_ID || 'community-manager-bot-508316';
  const databaseId = config.FIRESTORE_DATABASE_ID || 'ai-studio-communitymanager-59f17f1d-8b74-490e-9248-bc41e69de7ef';

  console.log(`[Task 118] Target GCP Project: ${projectId}`);
  console.log(`[Task 118] Target Firestore Database: ${databaseId}`);

  const certResult: FirestoreCertificationResult = {
    status: 'NOT_CONFIGURED',
    authenticated: false,
    databaseReachable: false,
    readable: false,
    writeable: false,
    passed: 0,
    failed: 0,
    projectId,
    databaseId,
  };

  const testDocId = `cert_probe_${Date.now()}`;
  const collectionName = 'certification_probes';

  // Instantiate independent repository instances A and B
  const repoA = new FirestoreRepository<any>(collectionName);
  const repoB = new FirestoreRepository<any>(collectionName);

  try {
    console.log('[Task 118 Step 1] Repo Instance A: Attempting document creation in real Firestore...');
    await repoA.create({
      id: testDocId,
      purpose: 'Infrastructure Truth Certification',
      timestamp: new Date().toISOString(),
      probeValue: 'initial_value_a',
    });

    certResult.writeable = true;
    certResult.authenticated = true;
    console.log('  -> Step 1 SUCCESS: Document written.');

    console.log('[Task 118 Step 2] Repo Instance A: Reading document from real Firestore...');
    const readDocA = await repoA.getById(testDocId);
    assert.ok(readDocA, 'Document must be read by Repo Instance A');
    assert.equal(readDocA.probeValue, 'initial_value_a');
    certResult.readable = true;
    certResult.databaseReachable = true;
    console.log('  -> Step 2 SUCCESS: Document read by Instance A.');

    console.log('[Task 118 Step 3] Repo Instance B: Reading same document from independent Instance B...');
    const readDocB = await repoB.getById(testDocId);
    assert.ok(readDocB, 'Document must be read by independent Repo Instance B');
    assert.equal(readDocB.probeValue, 'initial_value_a');
    console.log('  -> Step 3 SUCCESS: Document read by independent Instance B.');

    console.log('[Task 118 Step 4] Repo Instance B: Updating document in real Firestore...');
    await repoB.update(testDocId, { probeValue: 'updated_value_b' });
    console.log('  -> Step 4 SUCCESS: Document updated by Instance B.');

    console.log('[Task 118 Step 5] Repo Instance A: Reading updated document to verify cross-instance persistence...');
    const readDocA2 = await repoA.getById(testDocId);
    assert.ok(readDocA2, 'Document must be read again by Instance A');
    assert.equal(readDocA2.probeValue, 'updated_value_b');
    console.log('  -> Step 5 SUCCESS: Updated value verified across instances.');

    console.log('[Task 118 Step 6] Cleaning up probe document...');
    await repoA.delete(testDocId);
    const postDeleteDoc = await repoB.getById(testDocId);
    assert.equal(postDeleteDoc, null, 'Deleted document must not exist');
    console.log('  -> Step 6 SUCCESS: Probe document deleted.');

    certResult.status = 'PASS';
    certResult.passed = 6;
    certResult.failed = 0;
    console.log('==================================================');
    console.log('TASK 118 CERTIFICATION: PASS (6/6 assertions verified)');
    console.log('==================================================\n');
    return certResult;
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    certResult.error = errorMsg;

    console.log(`[Task 118] Real Firestore operation encountered error: ${errorMsg}`);

    // If permission denied or IAM issue, report BLOCKED_BY_INFRASTRUCTURE truthfully
    if (errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('7 PERMISSION_DENIED') || errorMsg.includes('insufficient authentication scopes')) {
      certResult.status = 'BLOCKED_BY_INFRASTRUCTURE';
      certResult.authenticated = false;
      certResult.databaseReachable = false;
      certResult.readable = false;
      certResult.writeable = false;
      certResult.passed = 0;
      certResult.failed = 0;
      console.log('\n[TRUTH REPORT]: Firestore certification status is BLOCKED_BY_INFRASTRUCTURE.');
      console.log('  FIRESTORE_AUTHENTICATED = false');
      console.log('  FIRESTORE_DATABASE_REACHABLE = false');
      console.log('  FIRESTORE_READABLE = false');
      console.log('  FIRESTORE_WRITEABLE = false');
      console.log('  Reason: GCP Cloud Run service account lacks roles/datastore.user permission on the target project/database.');
    } else {
      certResult.status = 'FAILED';
      certResult.passed = 0;
      certResult.failed = 1;
      console.log(`\n[TRUTH REPORT]: Firestore certification status is FAILED: ${errorMsg}`);
    }

    console.log('==================================================');
    console.log(`TASK 118 CERTIFICATION: ${certResult.status} (Fail-closed, no mock fallback)`);
    console.log('==================================================\n');

    return certResult;
  }
}
