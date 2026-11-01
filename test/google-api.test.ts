import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'x'.repeat(40);
const g = await import('../server/integrations/google/googleApi.js');

const st = g.signState({ userId: 'u1', communityId: 'c1', role: 'OWNER' });
const p = g.verifyState(st);
assert.equal(p.userId, 'u1'); assert.equal(p.communityId, 'c1');

const [body, sig] = st.split('.');
const forged = Buffer.from(JSON.stringify({ ...p, userId: 'attacker' })).toString('base64url') + '.' + sig;
assert.throws(() => g.verifyState(forged), /INVALID_STATE/);
assert.throws(() => g.verifyState('junk'), /INVALID_STATE/);
assert.throws(() => g.verifyState(body + '.' + 'A'.repeat(sig.length)), /INVALID_STATE/);

const enc = g.encrypt('refresh-token-123');
assert.notEqual(enc, 'refresh-token-123');
assert.equal(g.decrypt(enc), 'refresh-token-123');

process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 's';
const url = g.buildAuthorizeUrl(st);
assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
assert.ok(url.includes('access_type=offline') && url.includes('calendar.events'));
console.log('google-api: all checks passed');
