/**
 * Vector Clock implementation for tracking causal ordering in distributed systems.
 * Provides strict partial ordering and concurrency detection.
 */

export type ClockComparison = 'before' | 'after' | 'concurrent' | 'equal';

export class VectorClock {
  private clock: Map<string, number>;

  constructor(initial: Record<string, number> | Map<string, number> = {}) {
    if (initial instanceof Map) {
      this.clock = new Map(initial);
    } else {
      this.clock = new Map(Object.entries(initial));
    }
  }

  get(nodeId: string): number {
    return this.clock.get(nodeId) || 0;
  }

  set(nodeId: string, counter: number): void {
    this.clock.set(nodeId, counter);
  }

  increment(nodeId: string): VectorClock {
    const next = new VectorClock(this.clock);
    next.clock.set(nodeId, (next.clock.get(nodeId) || 0) + 1);
    return next;
  }

  merge(other: VectorClock): VectorClock {
    const merged = new VectorClock(this.clock);
    for (const [nodeId, counter] of other.clock.entries()) {
      const current = merged.clock.get(nodeId) || 0;
      merged.clock.set(nodeId, Math.max(current, counter));
    }
    return merged;
  }

  compare(other: VectorClock): ClockComparison {
    const allKeys = new Set([...this.clock.keys(), ...other.clock.keys()]);
    let greater = false;
    let smaller = false;

    for (const key of allKeys) {
      const v1 = this.get(key);
      const v2 = other.get(key);
      if (v1 > v2) greater = true;
      if (v1 < v2) smaller = true;
    }

    if (greater && smaller) return 'concurrent';
    if (greater && !smaller) return 'after';
    if (!greater && smaller) return 'before';
    return 'equal';
  }

  isConcurrentWith(other: VectorClock): boolean {
    return this.compare(other) === 'concurrent';
  }

  dominates(other: VectorClock): boolean {
    const res = this.compare(other);
    return res === 'after' || res === 'equal';
  }

  clone(): VectorClock {
    return new VectorClock(this.clock);
  }

  toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.clock.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  static fromJSON(data: Record<string, number>): VectorClock {
    return new VectorClock(data);
  }
}
