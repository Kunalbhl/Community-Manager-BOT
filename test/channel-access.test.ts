import assert from 'node:assert/strict';
import { isObfuscated, usableChannels, CHANNEL_OBFUSCATED } from '../server/integrations/discord/channelAccess.ts';

assert.equal(isObfuscated({ name: '___hidden___' }), true);
assert.equal(isObfuscated({ name: 'rules', flags: { bitfield: CHANNEL_OBFUSCATED } }), true);
assert.equal(isObfuscated({ name: 'rules', flags: CHANNEL_OBFUSCATED | 2 }), true);
assert.equal(isObfuscated({ name: 'rules', flags: { bitfield: 2 } }), false);
assert.equal(isObfuscated({ name: 'rules' }), false);
assert.equal(isObfuscated(null), false);
assert.deepEqual(usableChannels([{ name: 'a' }, { name: '___hidden___' }]).map((c: any) => c.name), ['a']);
console.log('channel-access ok');
