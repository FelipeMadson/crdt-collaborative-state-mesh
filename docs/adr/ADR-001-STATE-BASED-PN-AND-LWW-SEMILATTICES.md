# ADR-001: State-Based PN-Counter and LWW-Element-Set Semilattices

## Status
Accepted

## Context
Collaborative real-time applications and distributed edge networks require data types that can be concurrently modified by multiple nodes without distributed lock coordinators (e.g. Paxos/Raft) and without data divergence upon network partition healing.

## Decision
We implement state-based Conflict-Free Replicated Data Types (CvRDT) based on bounded join-semilattices $(S, \sqcup)$:
1. **PN-Counter (Positive-Negative Counter)**:
   - State: $P: \text{NodeId} \to \mathbb{N}$, $N: \text{NodeId} \to \mathbb{N}$.
   - Value: $\sum_{i} P(i) - \sum_{i} N(i)$.
   - Merge: $(P_1 \sqcup P_2)(i) = \max(P_1(i), P_2(i))$, $(N_1 \sqcup N_2)(i) = \max(N_1(i), N_2(i))$.
   - Properties: Commutative ($A \sqcup B = B \sqcup A$), Associative ($(A \sqcup B) \sqcup C = A \sqcup (B \sqcup C)$), Idempotent ($A \sqcup A = A$).
2. **LWW-Element-Set (Last-Write-Wins Element Set)**:
   - State: Add set $A \subseteq E \times \mathbb{R} \times \text{NodeId}$, Remove set $R \subseteq E \times \mathbb{R} \times \text{NodeId}$.
   - Lookup rule: $e \in S \iff \exists (e, t_a, n_a) \in A$ such that $\forall (e, t_r, n_r) \in R: t_a > t_r \lor (t_a = t_r \land n_a > n_r)$.
   - Merge: Union of add sets and remove sets with point-wise maximum timestamp retention.

## Consequences
- Guaranteed Strong Eventual Consistency (SEC) across any network topology.
- Zero distributed coordination overhead during local write operations.
