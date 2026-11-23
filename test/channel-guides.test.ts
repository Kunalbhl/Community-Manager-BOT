import assert from 'node:assert/strict';
import { GUIDES, GUIDE_FOOTER } from '../server/services/channelGuideText.ts';

for (const [k, g] of Object.entries(GUIDES)) {
  assert.ok(g.title && g.body.length > 80, `${k} has a real guide`);
  assert.ok(g.body.length < 4000, `${k} fits an embed`);
}
assert.equal(GUIDES.apply.staff, false);
assert.equal(GUIDES.review.staff, true);
assert.ok(GUIDE_FOOTER.length > 0);
console.log('channel-guides ok');
