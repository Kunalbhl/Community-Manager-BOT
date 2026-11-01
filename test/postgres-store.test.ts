/**
 * Integration test for the Supabase/Postgres document store and leadership lease.
 * Needs TEST_DATABASE_URL (CI provides a throwaway Postgres). Run: npx tsx test/postgres-store.test.ts
 */
import assert from 'node:assert/strict';
import { Timestamp } from '@google-cloud/firestore';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.log('SKIP: TEST_DATABASE_URL not set'); process.exit(0); }
process.env.DATABASE_URL = url;
process.env.DATABASE_SCHEMA = 'cm_test_' + Date.now();

const { postgresStore } = await import('../server/repositories/postgres.store.js');
let passed = 0;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log('ok -', name); };
const C = 'communities';

await t('set + getById roundtrip, null fields stripped', async () => {
  await postgresStore.set(C, 'c1', { name: 'Alpha', guildId: 'g1', tags: ['a', 'b'], n: 5, gone: null });
  const d = await postgresStore.getById(C, 'c1');
  assert.equal(d.name, 'Alpha'); assert.equal(d.id, 'c1'); assert.deepEqual(d.tags, ['a', 'b']); assert.ok(!('gone' in d));
});
await t('missing doc returns null', async () => { assert.equal(await postgresStore.getById(C, 'nope'), null); });
await t('where ==, !=, <, in, array-contains, orderBy, limit', async () => {
  await postgresStore.set(C, 'c2', { name: 'Beta', guildId: 'g2', tags: ['b'], n: 2 });
  await postgresStore.set(C, 'c3', { name: 'Gamma', guildId: 'g3', tags: ['c'], n: 9 });
  assert.equal((await postgresStore.list(C, { where: [{ field: 'guildId', operator: '==', value: 'g2' }] }))[0].id, 'c2');
  assert.equal((await postgresStore.list(C, { where: [{ field: 'guildId', operator: '!=', value: 'g2' }] })).length, 2);
  assert.deepEqual((await postgresStore.list(C, { where: [{ field: 'n', operator: '<', value: 6 }], orderBy: 'n' })).map((d: any) => d.id), ['c2', 'c1']);
  assert.equal((await postgresStore.list(C, { where: [{ field: 'guildId', operator: 'in', value: ['g1', 'g3'] }] })).length, 2);
  assert.equal((await postgresStore.list(C, { where: [{ field: 'tags', operator: 'array-contains', value: 'b' }] })).length, 2);
  assert.equal((await postgresStore.list(C, { orderBy: 'n', orderDirection: 'desc', limit: 1 }))[0].id, 'c3');
  assert.equal(await postgresStore.count(C, { where: [{ field: 'n', operator: '>=', value: 5 }] }), 2);
});
await t('update merges, supports dotted paths, fails on missing', async () => {
  await postgresStore.update(C, 'c1', { name: 'Alpha 2', 'settings.theme': 'dark' });
  const d = await postgresStore.getById(C, 'c1');
  assert.equal(d.name, 'Alpha 2'); assert.equal(d.settings.theme, 'dark'); assert.equal(d.n, 5);
  await assert.rejects(() => postgresStore.update(C, 'missing', { a: 1 }));
});
await t('upsert deep-merges and creates', async () => {
  await postgresStore.upsert(C, 'c1', { settings: { lang: 'en' } });
  const d = await postgresStore.getById(C, 'c1');
  assert.equal(d.settings.theme, 'dark'); assert.equal(d.settings.lang, 'en');
  await postgresStore.upsert(C, 'c9', { name: 'New' });
  assert.equal((await postgresStore.getById(C, 'c9')).name, 'New');
});
await t('Firestore Timestamp roundtrip and comparison', async () => {
  const past = Timestamp.fromMillis(Date.now() - 60000), future = Timestamp.fromMillis(Date.now() + 60000);
  await postgresStore.set('discordSessions', 's1', { expiresAt: past });
  await postgresStore.set('discordSessions', 's2', { expiresAt: future });
  const s = await postgresStore.getById('discordSessions', 's2');
  assert.ok(s.expiresAt instanceof Timestamp); assert.equal(s.expiresAt.toMillis(), future.toMillis());
  const expired = await postgresStore.list('discordSessions', { where: [{ field: 'expiresAt', operator: '<=', value: Timestamp.now() }] });
  assert.deepEqual(expired.map((d: any) => d.id), ['s1']);
});
await t('delete', async () => { await postgresStore.delete(C, 'c9'); assert.equal(await postgresStore.getById(C, 'c9'), null); });
await t('leadership lease: priority wins, holder renews, expiry hands over', async () => {
  assert.equal(await postgresStore.tryAcquireLease('bot', 'web', 10, 60), true);
  assert.equal(await postgresStore.tryAcquireLease('bot', 'vm', 100, 60), true, 'higher priority takes over');
  assert.equal(await postgresStore.tryAcquireLease('bot', 'web', 10, 60), false, 'lower priority must wait');
  assert.equal(await postgresStore.tryAcquireLease('bot', 'vm', 100, 60), true, 'holder renews');
  assert.equal(await postgresStore.tryAcquireLease('bot2', 'vm', 100, 0), true);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await postgresStore.tryAcquireLease('bot2', 'web', 10, 60), true, 'expired lease is taken');
});
await postgresStore.close();
console.log(`postgres-store: ${passed} passed`);
