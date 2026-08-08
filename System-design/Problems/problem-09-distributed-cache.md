# Design Problem 09 — Design a Distributed Cache (Redis-like)

> Worked end-to-end using the Master Framework (../00-DESIGN-PROBLEM-FRAMEWORK.md). Applies Parts 05, 05.5, 21, 24. Signature challenge: designing the cache infrastructure ITSELF — eviction, replication, and consistent hashing across nodes — rather than using a cache as a component of another system (contrast with problem-01, where Redis was a component; here it IS the system).

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: partitioning across nodes](#core)
5. [Eviction policy](#eviction)
6. [Replication & failure handling](#replication)
7. [Consistency trade-offs](#consistency)
8. [Scaling](#scaling)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. `GET key` → return value (or miss).
2. `SET key value [TTL]` → insert/update, optional expiry.
3. `DEL key` → remove.

**Non-functional:**
- **Sub-millisecond latency** — the entire point of a cache; a slow cache is worse than no cache.
- **Eviction under memory pressure** — RAM is finite; when full, something has to go.
- **Survive a node failure without full data loss** — a crashed node shouldn't wipe out the keys it owned.
- **Horizontally scalable** — add nodes as the working set grows past one machine's RAM.
- **High availability** over strict consistency — a cache miss is cheap (recompute/re-fetch); a cache that's *down* is not.

> This is not "add Redis in front of a DB" (problem-01). Here **we're building the thing Redis *is*** — the node cluster, the partitioning scheme, the eviction, the replication. Shape: **in-memory key-value store, horizontally partitioned, optimized for read/write speed over durability.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 500M keys, avg value size 1 KB.
- **Raw data:** 500M × 1 KB ≈ **500 GB**
- **With replication factor 2** (Part 21 — one replica per shard): **~1 TB** total RAM across the cluster.
- **Per-node RAM budget:** if each node offers ~50 GB usable cache RAM → **500 GB ÷ 50 GB ≈ 10 primary nodes** → **~20 nodes total** with replicas.
- **Ops/sec:** read-heavy workload, say 200,000 ops/sec cluster-wide → **200,000 ÷ 10 nodes ≈ 20,000 ops/s per node** — comfortably within a single Redis-like node's capability (single-threaded Redis does 100k+ ops/s, Part 5.5).

**Derived node count formula:** `N = ceil(total_dataset_size / usable_RAM_per_node)`, then scale `N` up further if per-node ops/sec would exceed what one node can serve. Both storage *and* throughput can independently force `N` up — always check both.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

A lightweight binary/text protocol over TCP (think RESP — Redis Serialization Protocol), not full HTTP — HTTP's overhead (headers, parsing) is too heavy for sub-millisecond ops.

```
GET key
→ value | (nil)

SET key value [EX seconds]
→ OK

DEL key
→ (integer) number of keys removed
```

- Client maintains a **persistent connection** (avoid TCP handshake cost per op).
- Client is **partition-aware** (see Part 4) — it computes which node owns a key *before* sending the request, rather than every node forwarding to every other node.

---

<a name="core"></a>
# 4. Core: partitioning across nodes 🎯

One node can't hold the whole dataset (500 GB > any single machine's practical RAM) — keys must be **split across N nodes**. This partitioning scheme is the signature challenge of *this* problem, the same way short-code generation was the challenge in problem-01.

### The naive approach — and why it breaks
```
node = hash(key) % N
```
Simple, evenly distributes keys **as long as N never changes**. But nodes *do* change — you add capacity, or a node dies and you replace it. The moment `N` changes:
```
key "session:9981":  hash = 48213
  10 nodes: 48213 % 10 = 3  → node 3
  11 nodes: 48213 % 11 = 4  → node 4   ← different node!
```
Changing `N` from 10 → 11 recomputes the modulo for **almost every key** — roughly `(N-1)/N` of them remap (Part 24), meaning **~90% of keys now point to the "wrong" node**. For a cache the consequence is brutal:

> **Mass cache stampede:** ~90% of GETs suddenly miss (the data physically isn't on the node the client now computes) → every one of those requests falls through to the origin DB simultaneously → the DB, which the cache exists to protect, gets hit with near-100% of traffic at once and can fall over. The exact failure mode Part 24 was written to prevent.

### The fix — consistent hashing (Part 24)
Instead of tying a key's home to the raw count `N`, place both **nodes** and **keys** on a **hash ring** (`0 … 2³²−1`, wraps around):

```
                    0 / 2³²
                       │
              ┌────────┴────────┐
         Node D                  Node A
              │                  │
    key "y" ●-┘                  └-● key "x"
              │                  │
         Node C                  Node B
              └────────┬────────┘
                        │
                (ring continues)
```
**Rule:** a key belongs to the **first node clockwise** from the key's position on the ring. Key "x" → Node A (next clockwise). Key "y" → Node D.

Because a key's home depends on **where it sits relative to nodes**, not on **how many nodes exist**, adding or removing a node only disturbs the **one arc** next to it — everything else on the ring is untouched. (Full mechanics, proof, and interview drilling in Part 24 — this section applies it, doesn't re-derive it.)

### Virtual nodes — even load distribution
A handful of physical nodes placed at random ring points is **lumpy** — one node might own 60% of the ring, another 5%. Fix: give each physical node **many** points on the ring (100–200 virtual nodes each: `hash("nodeA#1")`, `hash("nodeA#2")`, …).
```
Ring with vnodes:  A C B A D B C A D C B A ...   (interleaved evenly)
```
- **Even spread** — many small arcs per node average out (law of large numbers).
- **Graceful failure** — a dead node's ~150 scattered arcs redistribute across *every* remaining node, not dumped on one unlucky neighbor.
- **Weighted capacity** — give a beefier node (more RAM) more vnodes → proportionally larger share of keys, for free.

> **Interview framing:** "Naive modulo breaks because N changes; consistent hashing decouples key location from node count; virtual nodes fix the uneven-distribution side-effect of a plain ring." Say it in that order — it's the natural problem → fix → refinement arc.

---

<a name="eviction"></a>
# 5. Eviction policy

RAM is finite — once a node's memory budget is full, a `SET` must evict something to make room. Three common policies:

| Policy | Evicts | Best for |
|---|---|---|
| **LRU** (Least Recently Used) ✅ default | The key not *accessed* longest | General-purpose — "hot" keys stay, cold keys leave. Matches real access patterns (recency predicts future use). |
| **LFU** (Least Frequently Used) | The key accessed *fewest times* | Workloads where popularity is stable over time (e.g. a celebrity's profile is always hot, regardless of recency) — LRU can wrongly evict it during a brief lull. |
| **TTL-based** | Keys past their explicit expiry | Data with a known freshness window (sessions, OTPs, Part 5.5) — expire by design, not by memory pressure. |

**LRU is the default** because it needs no configuration and matches the general intuition "recently touched = likely to be touched again." Each node runs LRU **locally** — it's a per-node data structure problem, not a cluster-wide one. See **[LLD Problem 03 — LRU Cache](../../LLD/Problems/problem-03-lru-cache.md)** for the O(1) `get`+`put` implementation (hashmap + doubly linked list) that a single cache node uses internally to track and evict least-recently-used entries.

**Memory-pressure trigger:** each node tracks its own memory usage; when it crosses a configured threshold (e.g. `maxmemory`), the eviction policy kicks in **before** the `SET` that would exceed it — evict-then-insert, never let usage spike unbounded. Combine policies in practice: TTL keys expire proactively (lazy on access + a background sweep), and whatever's left competes under LRU/LFU once memory is tight.

---

<a name="replication"></a>
# 6. Replication & failure handling *(Part 21)*

Losing a node shouldn't mean losing that node's data outright. Each **shard** (the set of keys owned by one ring position) gets a **primary + replica**:

```
Node A (primary, shard 1)  ──async replicate──▶  Node A' (replica, shard 1)
Node B (primary, shard 2)  ──async replicate──▶  Node B' (replica, shard 2)
```
- Writes go to the **primary**; the primary asynchronously streams updates to its **replica**.
- Reads normally go to the primary too (freshest data); replicas exist for failover, and optionally to absorb read load if slightly-stale reads are acceptable.

### What happens when a node fails
1. Failure detected (missed heartbeats, Part 21).
2. **The ring re-routes**: the failed primary's ring position is removed (or its vnodes are marked down); clients/coordinators now resolve those keys' arc to the node that was its **replica**, which is promoted to primary.
3. **Only that shard's keys are affected** — not the whole cluster. This is the direct payoff of consistent hashing from Section 4: because each node owns a bounded arc (or a scattered set of vnode arcs), a failure's blast radius is that arc's data, not a global reshuffle. Contrast with the naive-modulo world, where losing *any* node would have already remapped everyone via `% N`.
4. Once the dead node is replaced, it rejoins the ring (new vnode positions or the same ones), and data re-replicates to it.

> A cache losing a *shard's* worth of keys is a partial, bounded cache-miss event (those keys will simply be re-fetched from the origin DB on next access) — **not** a cluster-wide outage. That containment is the whole reason to combine consistent hashing with per-shard replication.

---

<a name="consistency"></a>
# 7. Consistency trade-offs *(Part 4 — CAP)*

Primary → replica replication is **asynchronous** — during a network partition or right after a primary write, a replica may briefly serve **stale** data if it gets promoted before catching up. That's a conscious choice.

**Cache data is fine as eventually consistent.** Tie it to CAP (Part 4): during a partition, you must pick **A** (keep answering, possibly stale) or **C** (refuse until synced). For a cache specifically, **AP wins**:
- The cache is **never the source of truth** — the origin DB is (same principle as Part 5.5: "Redis is a fast layer, not the system of record"). A stale cache read is corrected on the *next* write-through or TTL expiry; it never corrupts real data.
- **Unavailability is worse than staleness** here — if the cache refuses to answer (chasing C), every one of those requests falls through to the origin DB, which is exactly the stampede scenario from Section 4. Availability *protects* the DB; consistency purity does not.
- Contrast with a payments ledger or inventory count, where CP is correct — being wrong is worse than being slow/unavailable. A cache inverts that: being *unavailable* is worse than being briefly wrong, because "wrong" here just means "not yet caught up," not "corrupted."

> **One-liner:** "A cache is disposable, derived data — CAP's forced choice during a partition should almost always favor A, because the origin system of record backstops any staleness, while an unavailable cache just pushes full load onto that origin system."

---

<a name="scaling"></a>
# 8. Scaling

Adding or removing nodes is the normal lifecycle of a cache cluster (growing working set, hardware refresh, rebalancing after a failure). Consistent hashing (Section 4 / Part 24) is what makes this cheap:

- **Naive `% N`:** changing node count remaps `(N-1)/N` of all keys — e.g. ~90% moving from 10 → 11 nodes. Unusable at cache scale.
- **Consistent hashing:** only the keys in the arc(s) adjacent to the joining/leaving node move. **Quantified: ~K/N keys move** (K = total keys, N = node count) — e.g. going from 10 → 11 nodes moves roughly **1/11th** of the keyspace, not 90% of it.
- With **virtual nodes**, that ~K/N movement is additionally spread evenly across *all* remaining nodes rather than dumped on one neighbor — no single node absorbs a sudden load spike during a rebalance.

**Order of scaling moves in practice:** add nodes to the ring (consistent hashing bounds the reshuffle cost) → increase replicas per shard if read load (not just storage) is the bottleneck → for extreme scale, shard the ring itself across independent clusters (Redis Cluster's approach, using 16,384 fixed hash slots instead of a literal ring — same goal, Part 24 §5).

---

<a name="arch"></a>
# 9. Full architecture

```
[Client]
   │  (partition-aware: computes which node owns "key" via the ring)
   ▼
[Hash Ring — consistent hashing + virtual nodes]   ← Part 24 (Section 4)
   │
   ├── Shard 1: [Node A primary] ──replicate──▶ [Node A' replica]
   ├── Shard 2: [Node B primary] ──replicate──▶ [Node B' replica]
   ├── Shard 3: [Node C primary] ──replicate──▶ [Node C' replica]
   └── Shard N: [Node .. primary] ──replicate──▶ [Node .. replica]
         │
         each node internally:
         [In-memory hashmap] + [LRU list for eviction]   ← per-node structure
         (see LLD Problem 03 — LRU Cache)
         Memory threshold hit → evict LRU entry before SET

Failure of Node B (primary) → ring re-routes shard 2 lookups to Node B'
   → Node B' promoted to primary → only shard 2's keys were ever "unavailable"
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "How do you decide which node a key lives on?"
> *"I hash both the nodes and the keys onto a circular hash ring — consistent hashing. A key belongs to the first node clockwise from its position. I don't use plain `hash(key) % N` because that ties every key's location to the total node count, so any time a node is added or removed, almost all keys remap at once — a mass cache miss that stampedes the origin database."*

### Q: "Why not just use modulo hashing, it's simpler?"
> *"It's simpler, but it doesn't survive scaling. Going from, say, 10 to 11 nodes remaps roughly (N-1)/N of all keys — about 90% — because the divisor itself changed. For a cache, that means ~90% of reads suddenly miss at the same moment, and all of them fall through to the database simultaneously. Consistent hashing bounds that to roughly K/N keys, localized to one arc of the ring, so scaling doesn't create a thundering herd."*

### Q: "What are virtual nodes and why do you need them?"
> *"A handful of physical nodes placed randomly on the ring gives an uneven split — one node can end up owning a much bigger arc than another, so it gets hotter, and if it dies, its whole load dumps onto a single neighbor. I give each physical node many virtual positions on the ring — a hundred or more — so the load averages out evenly, and a failure's keys scatter across every remaining node instead of overloading one."*

### Q: "How do you handle eviction when memory fills up?"
> *"Each node runs LRU by default, evicting the least-recently-accessed key before a SET that would exceed the memory budget — it's a per-node concern, implemented with a hashmap plus a doubly linked list for O(1) get and put. I'd consider LFU instead if access frequency is a better predictor of future use than recency, and I always let explicit TTLs expire keys proactively regardless of memory pressure, since those are removed by design, not by eviction."*

### Q: "What happens when a node crashes — do you lose data?"
> *"Not entirely. Every shard has a primary and a replica, and the primary asynchronously streams writes to its replica. When a node fails, the ring re-routes that shard's keys to the replica, which gets promoted to primary. Because consistent hashing bounds each node's ownership to specific arcs, only that shard's keys are affected — the rest of the cluster keeps serving normally. It's not zero data loss — very recent unreplicated writes on that shard could be lost — but it's bounded and partial, not catastrophic."*

### Q: "Should a distributed cache favor consistency or availability?"
> *"Availability. Under CAP, during a partition you have to pick — and for a cache specifically, the origin database is always the real source of truth, so a briefly stale cache read is harmless and self-corrects on the next write or TTL expiry. But an unavailable cache pushes 100% of that traffic straight onto the database it was supposed to protect, which is a much worse outcome. So I'd design for AP: keep answering, accept eventual consistency between primary and replica."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** in-memory KV store, horizontally partitioned, sub-ms latency, AP-leaning. Contrast with problem-01: there the cache was *a component*; here the cache *is* the system.
- **Estimate:** dataset size ÷ usable RAM per node = node count; also check ops/sec per node against a single node's ceiling (Redis-like: ~100k+ ops/s).
- **API:** lightweight TCP protocol (RESP-style) — `GET`/`SET [EX ttl]`/`DEL`, persistent connections, partition-aware client.
- **Core:** naive `hash(key) % N` remaps ~(N-1)/N keys on any node-count change → cache stampede on the origin DB. Fix: **consistent hashing** — hash ring, key → first node clockwise, key's home independent of N. **Virtual nodes** fix uneven load + spread failure impact across all nodes.
- **Eviction:** LRU default (per-node hashmap + DLL, O(1) — see LLD Problem 03); LFU for stable-popularity workloads; TTL for known-freshness data; evict-before-insert on memory threshold.
- **Replication:** primary + replica per shard; node failure → ring re-routes to replica, replica promoted; blast radius = one shard, not the cluster.
- **Consistency:** AP over CP — cache is disposable/derived data backstopped by the origin DB; unavailability (→ DB stampede) is worse than brief staleness.
- **Scaling:** consistent hashing bounds remapping to ~K/N keys per node-count change (vs ~90% with modulo going 10→11); vnodes spread that movement evenly.
- **Failure containment:** the entire design (ring + vnodes + per-shard replica) exists to make one node's failure a *local*, bounded event — never a cluster-wide one.

*— Design Problem 09 complete —*
