# ADR-002: Vector Clock Causality Tracking and Replicated Growable Array (RGA) Sequencing

## Status
Accepted

## Context
Concurrent real-time document editing (character insertion and deletion) requires preserving user intent and preventing interleaving anomalies (such as characters appearing scrambled after concurrent inserts). Simple timestamps fail due to clock drift across nodes.

## Decision
1. **Vector Clock Causality**:
   - Every node maintains a vector clock $V: \text{NodeId} \to \mathbb{N}$.
   - Causality comparison:
     - $V_1 < V_2 \iff \forall k, V_1[k] \le V_2[k] \land \exists k, V_1[k] < V_2[k]$.
     - Concurrent: $\neg(V_1 < V_2) \land \neg(V_2 < V_1) \land (V_1 \ne V_2)$.
2. **Replicated Growable Array (RGA)**:
   - Sequence elements are identified by immutable coordinates: $(\text{timestamp}, \text{nodeId})$.
   - Insertions reference an anchor predecessor ID.
   - When multiple nodes concurrently insert after the same anchor, deterministic ordering breaks ties using the tuple $(\text{timestamp}, \text{nodeId})$ in descending order.
   - Deletions set a tombstone flag, preserving causal lineage for future concurrent insertions.

## Consequences
- Guaranteed convergence to identical document strings across all nodes regardless of network message delivery order.
- Supports offline editing, intermittent network splits, and seamless partition healing.
