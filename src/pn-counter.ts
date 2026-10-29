/**
 * Positive-Negative Counter (PN-Counter) State-Based CRDT.
 * Monotonically grows both increments (P) and decrements (N).
 */

export class PNCounter {
  private p: Map<string, number>;
  private n: Map<string, number>;

  constructor(
    p: Record<string, number> | Map<string, number> = {},
    n: Record<string, number> | Map<string, number> = {}
  ) {
    this.p = p instanceof Map ? new Map(p) : new Map(Object.entries(p));
    this.n = n instanceof Map ? new Map(n) : new Map(Object.entries(n));
  }

  increment(nodeId: string, amount: number = 1): void {
    if (amount <= 0) throw new Error('Increment amount must be positive');
    const curr = this.p.get(nodeId) || 0;
    this.p.set(nodeId, curr + amount);
  }

  decrement(nodeId: string, amount: number = 1): void {
    if (amount <= 0) throw new Error('Decrement amount must be positive');
    const curr = this.n.get(nodeId) || 0;
    this.n.set(nodeId, curr + amount);
  }

  get value(): number {
    let sumP = 0;
    for (const v of this.p.values()) sumP += v;
    let sumN = 0;
    for (const v of this.n.values()) sumN += v;
    return sumP - sumN;
  }

  merge(other: PNCounter): PNCounter {
    const mergedP = new Map(this.p);
    for (const [k, v] of other.p.entries()) {
      mergedP.set(k, Math.max(mergedP.get(k) || 0, v));
    }

    const mergedN = new Map(this.n);
    for (const [k, v] of other.n.entries()) {
      mergedN.set(k, Math.max(mergedN.get(k) || 0, v));
    }

    return new PNCounter(mergedP, mergedN);
  }

  toJSON(): { p: Record<string, number>; n: Record<string, number>; value: number } {
    const pObj: Record<string, number> = {};
    for (const [k, v] of this.p.entries()) pObj[k] = v;
    const nObj: Record<string, number> = {};
    for (const [k, v] of this.n.entries()) nObj[k] = v;
    return { p: pObj, n: nObj, value: this.value };
  }

  static fromJSON(data: { p: Record<string, number>; n: Record<string, number> }): PNCounter {
    return new PNCounter(data.p, data.n);
  }
}
