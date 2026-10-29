import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNCounter } from '../src/pn-counter.ts';
import { LWWSet } from '../src/lww-set.ts';

test('PNCounter - maintains commutative, associative and idempotent semilattice properties', () => {
  const c1 = new PNCounter();
  c1.increment('nodeA', 10);
  c1.decrement('nodeA', 3); // 7

  const c2 = new PNCounter();
  c2.increment('nodeB', 5);
  c2.decrement('nodeB', 1); // 4

  // Idempotence: c1.merge(c1) == c1
  const selfMerge = c1.merge(c1);
  assert.strictEqual(selfMerge.value, 7);

  // Commutativity: c1.merge(c2) == c2.merge(c1)
  const m12 = c1.merge(c2);
  const m21 = c2.merge(c1);
  assert.strictEqual(m12.value, 11);
  assert.strictEqual(m21.value, 11);

  // Associativity: (c1 + c2) + c3 == c1 + (c2 + c3)
  const c3 = new PNCounter();
  c3.increment('nodeC', 20);
  const left = m12.merge(c3);
  const right = c1.merge(c2.merge(c3));
  assert.strictEqual(left.value, 31);
  assert.strictEqual(right.value, 31);
});

test('LWWSet - resolves concurrent additions and deletions with Last-Write-Wins semantics', () => {
  const set1 = new LWWSet();
  const set2 = new LWWSet();

  const t1 = 1000;
  const t2 = 2000;

  // Node A adds 'item1' at t1
  set1.add('item1', 'nodeA', t1);
  // Node B removes 'item1' at t2 (later timestamp)
  set2.remove('item1', 'nodeB', t2);

  const merged = set1.merge(set2);
  assert.strictEqual(merged.has('item1'), false);

  // Node A re-adds 'item1' at t3 > t2
  const set3 = new LWWSet();
  set3.add('item1', 'nodeA', 3000);

  const finalState = merged.merge(set3);
  assert.strictEqual(finalState.has('item1'), true);
  assert.deepStrictEqual(finalState.elements(), ['item1']);
});
