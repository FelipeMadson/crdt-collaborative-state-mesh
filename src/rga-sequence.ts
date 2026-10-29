/**
 * Replicated Growable Array (RGA) Sequence CRDT for collaborative text editing.
 * Preserves user intent under concurrent insertions and deletions with zero coordination locks.
 */

export interface RGANode {
  id: string;        // Formatted as "${timestamp}:${nodeId}:${seq}"
  value: string;
  anchorId: string;  // 'START' or another node ID
  timestamp: number;
  nodeId: string;
  deleted: boolean;
}

export class RGASequence {
  private nodes: RGANode[] = [];

  constructor(initialNodes?: RGANode[]) {
    if (initialNodes) {
      this.nodes = initialNodes.map(n => ({ ...n }));
    }
  }

  clone(): RGASequence {
    return new RGASequence(this.nodes);
  }

  insert(value: string, anchorId: string = 'START', nodeId: string, timestamp: number = Date.now()): string {
    const id = `${timestamp}:${nodeId}:${Math.random().toString(36).slice(2, 6)}`;
    const newNode: RGANode = {
      id,
      value,
      anchorId,
      timestamp,
      nodeId,
      deleted: false
    };

    this.integrate(newNode);
    return id;
  }

  delete(id: string): boolean {
    const node = this.nodes.find(n => n.id === id);
    if (node && !node.deleted) {
      node.deleted = true;
      return true;
    }
    return false;
  }

  private compareNodes(a: RGANode, b: RGANode): number {
    if (a.timestamp !== b.timestamp) {
      return b.timestamp - a.timestamp; // Higher timestamp wins (comes first)
    }
    return b.nodeId.localeCompare(a.nodeId);
  }

  private integrate(newNode: RGANode): void {
    if (this.nodes.some(n => n.id === newNode.id)) {
      // Node already exists (idempotent)
      return;
    }

    let insertIdx = 0;
    if (newNode.anchorId !== 'START') {
      const anchorIdx = this.nodes.findIndex(n => n.id === newNode.anchorId);
      if (anchorIdx === -1) {
        // Fallback if anchor not yet found: append to end
        insertIdx = this.nodes.length;
      } else {
        insertIdx = anchorIdx + 1;
        // Skip over nodes that have the same anchor but higher priority
        while (
          insertIdx < this.nodes.length &&
          this.nodes[insertIdx].anchorId === newNode.anchorId &&
          this.compareNodes(this.nodes[insertIdx], newNode) < 0
        ) {
          insertIdx++;
        }
      }
    } else {
      // Anchor is START: skip over other START-anchored nodes with higher priority
      while (
        insertIdx < this.nodes.length &&
        this.nodes[insertIdx].anchorId === 'START' &&
        this.compareNodes(this.nodes[insertIdx], newNode) < 0
      ) {
        insertIdx++;
      }
    }

    this.nodes.splice(insertIdx, 0, newNode);
  }

  merge(other: RGASequence): RGASequence {
    const result = new RGASequence(this.nodes);

    // Integrate all nodes from other
    for (const otherNode of other.nodes) {
      const existing = result.nodes.find(n => n.id === otherNode.id);
      if (existing) {
        if (otherNode.deleted) {
          existing.deleted = true;
        }
      } else {
        result.integrate(otherNode);
      }
    }

    this.nodes = result.nodes;
    return this;
  }

  getText(): string {
    return this.nodes
      .filter(n => !n.deleted)
      .map(n => n.value)
      .join('');
  }

  getNodes(): RGANode[] {
    return this.nodes.map(n => ({ ...n }));
  }

  toJSON(): { text: string; length: number; nodes: RGANode[] } {
    return {
      text: this.getText(),
      length: this.getText().length,
      nodes: this.getNodes()
    };
  }

  static fromJSON(data: { nodes: RGANode[] }): RGASequence {
    return new RGASequence(data.nodes);
  }
}
