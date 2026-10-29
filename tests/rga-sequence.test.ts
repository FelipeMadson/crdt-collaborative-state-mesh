import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RGASequence } from '../src/rga-sequence.ts';

test('RGASequence - handles sequential text typing and deletions', () => {
  const rga = new RGASequence();
  const idH = rga.insert('H', 'START', 'nodeA', 100);
  const idE = rga.insert('E', idH, 'nodeA', 101);
  const idL1 = rga.insert('L', idE, 'nodeA', 102);
  const idL2 = rga.insert('L', idL1, 'nodeA', 103);
  const idO = rga.insert('O', idL2, 'nodeA', 104);

  assert.strictEqual(rga.getText(), 'HELLO');

  // Delete 'E'
  rga.delete(idE);
  assert.strictEqual(rga.getText(), 'HLLO');
});

test('RGASequence - resolves concurrent insertions at the same anchor without interleaving', () => {
  const doc1 = new RGASequence();
  const doc2 = new RGASequence();

  // Initial common state: "CAT"
  const idC = doc1.insert('C', 'START', 'nodeA', 100);
  const idA = doc1.insert('A', idC, 'nodeA', 101);
  const idT = doc1.insert('T', idA, 'nodeA', 102);

  // Sync doc2
  doc2.merge(doc1);
  assert.strictEqual(doc2.getText(), 'CAT');

  // Concurrent edit:
  // Node A inserts 'O' after 'C' -> "COAT" (timestamp 200)
  doc1.insert('O', idC, 'nodeA', 200);

  // Node B inserts 'H' after 'C' -> "CHAT" (timestamp 205)
  doc2.insert('H', idC, 'nodeB', 205);

  // Merge in both directions
  const merged1 = doc1.clone().merge(doc2);
  const merged2 = doc2.clone().merge(doc1);

  // Both must converge to the exact same string
  assert.strictEqual(merged1.getText(), merged2.getText());
  // Because timestamp 205 > 200, 'H' comes before 'O' -> "CHOAT"
  assert.strictEqual(merged1.getText(), 'CHOAT');
});
