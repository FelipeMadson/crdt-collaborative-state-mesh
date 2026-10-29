import { VectorClock } from './vector-clock.ts';
import { PNCounter } from './pn-counter.ts';
import { LWWSet, type ElementRecord } from './lww-set.ts';
import { RGASequence, type RGANode } from './rga-sequence.ts';

export interface CRDTDelta {
  originNodeId: string;
  clock: Record<string, number>;
  timestamp: number;
  type: 'counter' | 'set' | 'text' | 'full';
  payload: {
    counter?: { p: Record<string, number>; n: Record<string, number> };
    set?: { addSet: Record<string, ElementRecord>; removeSet: Record<string, ElementRecord> };
    text?: { nodes: RGANode[] };
  };
}

export class MeshNode {
  readonly nodeId: string;
  private clock: VectorClock;
  private counter: PNCounter;
  private set: LWWSet;
  private text: RGASequence;
  private peers: Set<string> = new Set();
  private totalMutations: number = 0;
  private totalDeltasReceived: number = 0;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.clock = new VectorClock({ [nodeId]: 0 });
    this.counter = new PNCounter();
    this.set = new LWWSet();
    this.text = new RGASequence();
  }

  addPeer(peerId: string): void {
    if (peerId !== this.nodeId) {
      this.peers.add(peerId);
    }
  }

  getPeers(): string[] {
    return Array.from(this.peers).sort();
  }

  mutateCounter(amount: number): CRDTDelta {
    this.clock = this.clock.increment(this.nodeId);
    if (amount >= 0) {
      this.counter.increment(this.nodeId, amount);
    } else {
      this.counter.decrement(this.nodeId, Math.abs(amount));
    }
    this.totalMutations++;

    return {
      originNodeId: this.nodeId,
      clock: this.clock.toJSON(),
      timestamp: Date.now(),
      type: 'counter',
      payload: { counter: this.counter.toJSON() }
    };
  }

  addSetElement(element: string): CRDTDelta {
    this.clock = this.clock.increment(this.nodeId);
    const ts = Date.now();
    this.set.add(element, this.nodeId, ts);
    this.totalMutations++;

    return {
      originNodeId: this.nodeId,
      clock: this.clock.toJSON(),
      timestamp: ts,
      type: 'set',
      payload: { set: this.set.toJSON() }
    };
  }

  removeSetElement(element: string): CRDTDelta {
    this.clock = this.clock.increment(this.nodeId);
    const ts = Date.now();
    this.set.remove(element, this.nodeId, ts);
    this.totalMutations++;

    return {
      originNodeId: this.nodeId,
      clock: this.clock.toJSON(),
      timestamp: ts,
      type: 'set',
      payload: { set: this.set.toJSON() }
    };
  }

  insertText(char: string, anchorId: string = 'START'): { nodeCreatedId: string; delta: CRDTDelta } {
    this.clock = this.clock.increment(this.nodeId);
    const ts = Date.now();
    const id = this.text.insert(char, anchorId, this.nodeId, ts);
    this.totalMutations++;

    const delta: CRDTDelta = {
      originNodeId: this.nodeId,
      clock: this.clock.toJSON(),
      timestamp: ts,
      type: 'text',
      payload: { text: this.text.toJSON() }
    };

    return { nodeCreatedId: id, delta };
  }

  deleteText(id: string): CRDTDelta {
    this.clock = this.clock.increment(this.nodeId);
    this.text.delete(id);
    this.totalMutations++;

    return {
      originNodeId: this.nodeId,
      clock: this.clock.toJSON(),
      timestamp: Date.now(),
      type: 'text',
      payload: { text: this.text.toJSON() }
    };
  }

  applyDelta(delta: CRDTDelta): boolean {
    if (delta.originNodeId === this.nodeId) return false;

    // Merge vector clock
    const remoteClock = VectorClock.fromJSON(delta.clock);
    this.clock = this.clock.merge(remoteClock);

    // Merge CRDT state
    if (delta.payload.counter) {
      const remoteCounter = PNCounter.fromJSON(delta.payload.counter);
      this.counter = this.counter.merge(remoteCounter);
    }

    if (delta.payload.set) {
      const remoteSet = LWWSet.fromJSON(delta.payload.set);
      this.set = this.set.merge(remoteSet);
    }

    if (delta.payload.text) {
      const remoteText = RGASequence.fromJSON(delta.payload.text);
      this.text = this.text.merge(remoteText);
    }

    this.addPeer(delta.originNodeId);
    this.totalDeltasReceived++;
    return true;
  }

  getState(): {
    nodeId: string;
    clock: Record<string, number>;
    counter: number;
    set: string[];
    text: string;
    peers: string[];
    metrics: { totalMutations: number; totalDeltasReceived: number };
  } {
    return {
      nodeId: this.nodeId,
      clock: this.clock.toJSON(),
      counter: this.counter.value,
      set: this.set.elements(),
      text: this.text.getText(),
      peers: this.getPeers(),
      metrics: {
        totalMutations: this.totalMutations,
        totalDeltasReceived: this.totalDeltasReceived
      }
    };
  }

  getFullSnapshot(): CRDTDelta {
    return {
      originNodeId: this.nodeId,
      clock: this.clock.toJSON(),
      timestamp: Date.now(),
      type: 'full',
      payload: {
        counter: this.counter.toJSON(),
        set: this.set.toJSON(),
        text: this.text.toJSON()
      }
    };
  }

  exportPrometheus(): string {
    const s = this.getState();
    return [
      '# HELP crdt_mesh_counter_value Live PN-Counter aggregated value',
      '# TYPE crdt_mesh_counter_value gauge',
      `crdt_mesh_counter_value{node="${this.nodeId}"} ${s.counter}`,
      '# HELP crdt_mesh_set_size Active elements in LWW-Set',
      '# TYPE crdt_mesh_set_size gauge',
      `crdt_mesh_set_size{node="${this.nodeId}"} ${s.set.length}`,
      '# HELP crdt_mesh_text_length Collaborative string length',
      '# TYPE crdt_mesh_text_length gauge',
      `crdt_mesh_text_length{node="${this.nodeId}"} ${s.text.length}`,
      '# HELP crdt_mesh_peers_connected Total active mesh neighbors',
      '# TYPE crdt_mesh_peers_connected gauge',
      `crdt_mesh_peers_connected{node="${this.nodeId}"} ${s.peers.length}`,
      '# HELP crdt_mesh_mutations_total Total local state mutations',
      '# TYPE crdt_mesh_mutations_total counter',
      `crdt_mesh_mutations_total{node="${this.nodeId}"} ${s.metrics.totalMutations}`,
      '# HELP crdt_mesh_deltas_received_total Total remote deltas synchronized',
      '# TYPE crdt_mesh_deltas_received_total counter',
      `crdt_mesh_deltas_received_total{node="${this.nodeId}"} ${s.metrics.totalDeltasReceived}`
    ].join('\n') + '\n';
  }
}
