import assert from 'node:assert/strict';
import { drawRound, pickReplacement } from '../server/services/giveawayDraw.logic.js';

const entries = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, status: 'VALID', won: [] as string[] }));
entries.push({ id: 'dq', status: 'DISQUALIFIED', won: [] });

// Several prizes in one round: nobody wins twice, disqualified never wins.
for (let n = 0; n < 200; n++) {
  const r = drawRound(entries, [{ id: 'a', count: 3, allowRepeat: false, winners: [] }, { id: 'b', count: 4, allowRepeat: false, winners: [] }]);
  const all = [...r.a, ...r.b];
  assert.equal(all.length, 7);
  assert.equal(new Set(all).size, 7);
  assert.ok(!all.includes('dq'));
}
// Past winners are skipped in a later round; with too few left, fewer winners are returned.
const after = entries.map((e) => (['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'].includes(e.id) ? { ...e, won: ['a'] } : e));
const r2 = drawRound(after, [{ id: 'c', count: 5, allowRepeat: false, winners: [] }]);
assert.deepEqual([...r2.c].sort(), ['e8', 'e9']);
// Repeat winners allowed on request.
assert.equal(drawRound(after, [{ id: 'c', count: 5, allowRepeat: true, winners: [] }]).c.length, 5);
// Replacement is never an existing winner of that prize.
for (let n = 0; n < 100; n++) {
  const rep = pickReplacement(entries, { id: 'a', count: 3, allowRepeat: false, winners: ['e0', 'e1', 'e2'] });
  assert.ok(rep && !['e0', 'e1', 'e2', 'dq'].includes(rep));
}
console.log('giveaway-draw: ok');
