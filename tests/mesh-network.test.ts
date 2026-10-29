import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshNode } from '../src/mesh-node.ts';

test('MeshNode - achieves Strong Eventual Consistency across 3 partitioned nodes', () => {
  const nodeA = new MeshNode('node-alpha');
  const nodeB = new MeshNode('node-beta');
  const nodeC = new MeshNode('node-gamma');

  // Network partition: nodes perform mutations independently in isolation
  const deltaA1 = nodeA.mutateCounter(50);
  const deltaA2 = nodeA.addSetElement('config:v1');
  const { delta: deltaA3 } = nodeA.insertText('A', 'START');

  const deltaB1 = nodeB.mutateCounter(-20);
  const deltaB2 = nodeB.addSetElement('config:v2');
  const { delta: deltaB3 } = nodeB.insertText('B', 'START');

  const deltaC1 = nodeC.mutateCounter(100);
  const deltaC2 = nodeC.removeSetElement('config:v1');
  const { delta: deltaC3 } = nodeC.insertText('C', 'START');

  // Partition heals: exchange all deltas among all nodes in arbitrary orders
  const allDeltas = [deltaA1, deltaA2, deltaA3, deltaB1, deltaB2, deltaB3, deltaC1, deltaC2, deltaC3];

  for (const d of allDeltas) {
    nodeA.applyDelta(d);
  }

  // Shuffle order for Node B
  const shuffled = [...allDeltas].reverse();
  for (const d of shuffled) {
    nodeB.applyDelta(d);
  }

  // Arbitrary interleaved order for Node C
  for (const d of [deltaC1, deltaB2, deltaA3, deltaA1, deltaB1, deltaC2, deltaA2, deltaB3, deltaC3]) {
    nodeC.applyDelta(d);
  }

  const stateA = nodeA.getState();
  const stateB = nodeB.getState();
  const stateC = nodeC.getState();

  // All three nodes must converge to the identical state
  assert.strictEqual(stateA.counter, 130); // 50 - 20 + 100
  assert.strictEqual(stateB.counter, 130);
  assert.strictEqual(stateC.counter, 130);

  assert.deepStrictEqual(stateA.set, stateB.set);
  assert.deepStrictEqual(stateB.set, stateC.set);

  assert.strictEqual(stateA.text, stateB.text);
  assert.strictEqual(stateB.text, stateC.text);
});
