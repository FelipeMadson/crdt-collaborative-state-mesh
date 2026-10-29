import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshNode } from '../src/mesh-node.ts';
import { CRDTServer } from '../src/server.ts';

test('CRDTServer - performs HTTP mutations, delta syncing and Prometheus metrics export', async () => {
  const node = new MeshNode('server-node-1');
  const server = new CRDTServer(node);
  const info = await server.listen(0, '127.0.0.1');
  const baseUrl = `http://${info.host}:${info.port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const health = await healthRes.json() as any;
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.nodeId, 'server-node-1');

    // 2. Mutate counter
    const counterRes = await fetch(`${baseUrl}/mutate/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 15 })
    });
    assert.strictEqual(counterRes.status, 200);
    const counterData = await counterRes.json() as any;
    assert.strictEqual(counterData.state.counter, 15);

    // 3. Mutate set
    const setRes = await fetch(`${baseUrl}/mutate/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', element: 'alpha-service' })
    });
    assert.strictEqual(setRes.status, 200);

    // 4. Mutate text
    const textRes = await fetch(`${baseUrl}/mutate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'insert', char: 'Z' })
    });
    assert.strictEqual(textRes.status, 200);

    // 5. Inbound delta from remote peer
    const remoteNode = new MeshNode('remote-peer-2');
    const remoteDelta = remoteNode.mutateCounter(40);

    const syncRes = await fetch(`${baseUrl}/sync/delta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remoteDelta)
    });
    assert.strictEqual(syncRes.status, 200);
    const syncData = await syncRes.json() as any;
    assert.strictEqual(syncData.state.counter, 55); // 15 + 40
    assert.ok(syncData.state.peers.includes('remote-peer-2'));

    // 6. Prometheus metrics
    const metricsRes = await fetch(`${baseUrl}/metrics`);
    assert.strictEqual(metricsRes.status, 200);
    const metricsText = await metricsRes.text();
    assert.ok(metricsText.includes('crdt_mesh_counter_value{node="server-node-1"} 55'));
    assert.ok(metricsText.includes('crdt_mesh_peers_connected{node="server-node-1"} 1'));
  } finally {
    await server.close();
  }
});
