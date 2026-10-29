/**
 * Last-Write-Wins Element Set (LWW-Element-Set) CRDT.
 * Guarantees convergence across concurrent additions and removals.
 */

export interface ElementRecord {
  timestamp: number;
  nodeId: string;
}

export class LWWSet<T extends string = string> {
  private addSet: Map<T, ElementRecord>;
  private removeSet: Map<T, ElementRecord>;

  constructor(
    addSet: Map<T, ElementRecord> | Record<string, ElementRecord> = {},
    removeSet: Map<T, ElementRecord> | Record<string, ElementRecord> = {}
  ) {
    this.addSet = addSet instanceof Map ? new Map(addSet) : new Map(Object.entries(addSet) as [T, ElementRecord][]);
    this.removeSet = removeSet instanceof Map ? new Map(removeSet) : new Map(Object.entries(removeSet) as [T, ElementRecord][]);
  }

  add(element: T, nodeId: string, timestamp: number = Date.now()): void {
    const existing = this.addSet.get(element);
    if (!existing || timestamp > existing.timestamp || (timestamp === existing.timestamp && nodeId > existing.nodeId)) {
      this.addSet.set(element, { timestamp, nodeId });
    }
  }

  remove(element: T, nodeId: string, timestamp: number = Date.now()): void {
    const existing = this.removeSet.get(element);
    if (!existing || timestamp > existing.timestamp || (timestamp === existing.timestamp && nodeId > existing.nodeId)) {
      this.removeSet.set(element, { timestamp, nodeId });
    }
  }

  has(element: T): boolean {
    const addRec = this.addSet.get(element);
    if (!addRec) return false;

    const remRec = this.removeSet.get(element);
    if (!remRec) return true;

    if (addRec.timestamp > remRec.timestamp) return true;
    if (remRec.timestamp > addRec.timestamp) return false;

    // Tie-breaker on identical timestamp: higher nodeId wins
    return addRec.nodeId > remRec.nodeId;
  }

  elements(): T[] {
    const active: T[] = [];
    for (const elem of this.addSet.keys()) {
      if (this.has(elem)) {
        active.push(elem);
      }
    }
    return active.sort();
  }

  merge(other: LWWSet<T>): LWWSet<T> {
    const mergedAdd = new Map(this.addSet);
    for (const [elem, rec] of other.addSet.entries()) {
      const cur = mergedAdd.get(elem);
      if (!cur || rec.timestamp > cur.timestamp || (rec.timestamp === cur.timestamp && rec.nodeId > cur.nodeId)) {
        mergedAdd.set(elem, rec);
      }
    }

    const mergedRem = new Map(this.removeSet);
    for (const [elem, rec] of other.removeSet.entries()) {
      const cur = mergedRem.get(elem);
      if (!cur || rec.timestamp > cur.timestamp || (rec.timestamp === cur.timestamp && rec.nodeId > cur.nodeId)) {
        mergedRem.set(elem, rec);
      }
    }

    return new LWWSet(mergedAdd, mergedRem);
  }

  toJSON(): { addSet: Record<string, ElementRecord>; removeSet: Record<string, ElementRecord>; elements: T[] } {
    const addObj: Record<string, ElementRecord> = {};
    for (const [k, v] of this.addSet.entries()) addObj[k] = v;
    const remObj: Record<string, ElementRecord> = {};
    for (const [k, v] of this.removeSet.entries()) remObj[k] = v;
    return { addSet: addObj, removeSet: remObj, elements: this.elements() };
  }

  static fromJSON<T extends string = string>(data: {
    addSet: Record<string, ElementRecord>;
    removeSet: Record<string, ElementRecord>;
  }): LWWSet<T> {
    return new LWWSet<T>(data.addSet, data.removeSet);
  }
}
