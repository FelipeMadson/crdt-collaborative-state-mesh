import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VectorClock } from '../src/vector-clock.ts';

test('VectorClock - tracks causality, dominance and concurrency accurately', () => {
  const v1 = new VectorClock({ A: 1, B: 0 });
  const v2 = v1.increment('A'); // A:2, B:0
  assert.strictEqual(v1.compare(v2), 'before');
  assert.strictEqual(v2.compare(v1), 'after');
  assert.strictEqual(v2.dominates(v1), true);

  const v3 = v1.increment('B'); // A:1, B:1
  // v2 (A:2, B:0) and v3 (A:1, B:1) are concurrent!
  assert.strictEqual(v2.compare(v3), 'concurrent');
  assert.strictEqual(v2.isConcurrentWith(v3), true);

  // Merge v2 and v3
  const v4 = v2.merge(v3); // A:2, B:1
  assert.strictEqual(v4.get('A'), 2);
  assert.strictEqual(v4.get('B'), 1);
  assert.strictEqual(v4.dominates(v2), true);
  assert.strictEqual(v4.dominates(v3), true);
});
