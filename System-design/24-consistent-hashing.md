# System Design Study Notes — Part 24

## Consistent Hashing (The Ring, Virtual Nodes, Minimal Remapping)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, the naive-hashing failure, the ring, virtual nodes, and interview Q&A included.
>
> **Continues:** the missing piece under Part 21 (sharding) — *how* you decide which shard/node a key lives on without reshuffling everything when nodes change. Ties to Part 5 / 5.5 (caching & Redis — avoiding cache stampede) and Part 2.5 (load balancers — sticky routing).

---

## Table of Contents

1. [The problem: why naive hashing breaks](#problem)
2. [The idea: a ring (analogy)](#ring)
3. [Why it fixes it: adding/removing a node](#addremove)
4. [The catch: uneven distribution → virtual nodes](#vnodes)
5. [Where it's actually used](#used)
6. [Interview questions & answers](#interview)
7. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: why naive hashing breaks

With N servers, the obvious way to spread keys is modulo:
```
server = hash(key) % N        (N = number of servers)
```
`hash("user:42") % 4 = 2` → server 2. Fast, even… until **N changes**.

Add a server (`% 5`) or lose one (`% 3`) and the divisor changes for **every key**:
```
key "user:99":  hash = 1003
  4 servers: 1003 % 4 = 3  → server 3
  5 servers: 1003 % 5 = 3  → server 3   (lucky few stay)
  ...but MOST keys now compute a different server
```
The math: changing N remaps roughly **(N−1)/N of all keys**. Going 4→5 servers moves about **80%** of keys.

Why that's catastrophic:
- **Cache:** ~80% of lookups suddenly **miss** → all those requests **stampede the database** at once → DB can fall over.
- **Sharded DB:** you must physically **move ~80% of the data** just to add one node.

> Core flaw: naive modulo ties every key's location to the **total count N**. Change N → the whole map reshuffles.

---

<a name="ring"></a>
# 2. The idea: a ring (analogy)

**Consistent hashing decouples a key's location from the server *count*.** Instead of `% N`, picture a **circular ring** of hash values `0 … 2³²−1` that wraps around (like a clock).

```
              0 / 2³²
                 ·
         S3 ·         · S1
            ·  (ring)  ·
         ·               ·
            S2 ·       ·
                 ·
```
- **Hash each server** onto the ring: `hash(serverIP)` → a point.
- **Hash each key** onto the *same* ring: `hash(key)` → a point.
- **Rule:** a key belongs to the **first server clockwise** from the key's position.

```
Clockwise:  ...→ [key X] → [S1] → [key Y] → [S2] → [S3] → (wrap to 0)
  key X → first server clockwise = S1
  key Y → S2
```

The key's home depends on **where it lands relative to servers**, not on **how many** servers exist. That single change is what makes scaling cheap.

---

<a name="addremove"></a>
# 3. Why it fixes it: adding/removing a node

Only the keys in **one arc** of the ring are affected; everything else keeps its home.

**Remove S2** (crash): keys that mapped to S2 now walk clockwise to the **next** server (S3). Every other key untouched.
```
Before:  [key Y] → S2 → S3
After:   [key Y] ────────→ S3     (only S2's keys moved; S1's & S3's unchanged)
```

**Add S4** between S1 and S2: only keys in the arc *just before* S4 move from S2 → S4. Everyone else stays put.
```
Before:  [key Z] → S2
After:   [key Z] → S4            (S4 steals one arc from S2 only)
```

The math: on average only **K/N keys move** (K = total keys, N = servers) — not ~all of them. Adding a 5th server to 4 moves ~**1/5** of keys, versus 80% with naive modulo.

> The whole point: **minimal, localized remapping**. Disruption is proportional to `1/N` and confined to one arc.

---

<a name="vnodes"></a>
# 4. The catch: uneven distribution → virtual nodes

Plain ring hashing has a flaw: with few servers, their random ring positions are **lumpy** — one server can own a huge arc while another owns a sliver.
```
Bad luck:  S1 owns 60% of ring, S2 owns 30%, S3 owns 10%  → S1 overloaded 🔥
```
And when a node dies, its **entire** load dumps onto the *single* next node → sudden hotspot.

**Fix: virtual nodes (vnodes / replicas).** Place each physical server at **many** points around the ring (e.g. 100–200 virtual copies: `hash("S1#1")`, `hash("S1#2")`, …).
```
Ring with vnodes:  S1 S3 S1 S2 S1 S3 S2 S1 S2 S3 ...   (interleaved all around)
```
Two wins:
1. **Even spread** — many small arcs per server average out to a near-equal share (law of large numbers). More vnodes → smoother balance.
2. **Graceful failure/join** — a dead node's 100 scattered arcs redistribute across **all** remaining servers, not dumped on one. Adding a node steals a little from everyone.

Bonus: give a beefier server **more** vnodes → proportionally larger share (**weighted** distribution).

---

<a name="used"></a>
# 5. Where it's actually used

- **Distributed caches** — Memcached client-side sharding; *the* original motivation (avoid cache stampede on scaling).
- **Databases** — **Cassandra** and **DynamoDB** place data across nodes with consistent hashing + vnodes.
- **Redis Cluster** — a *variant*: uses **16,384 fixed hash slots** instead of a pure ring, but the goal is identical (minimal data movement when nodes change). "Same idea, different implementation."
- **Load balancers / CDNs** — route a given client or URL consistently to the same backend/edge node (cache affinity, sticky sessions).

> This is the missing piece under **Part 21 (sharding)**: *"which shard does a key go to, and how do I add a shard without reshuffling everything?"* → consistent hashing.

---

<a name="interview"></a>
# 6. Interview questions & answers

### Q: "What problem does consistent hashing solve?"
> *"Naive `hash(key) % N` ties every key to the server count N, so when N changes — add or remove a node — almost every key remaps: around (N−1)/N of them. For a cache that's a mass miss and a database stampede; for a sharded DB it means moving nearly all the data. Consistent hashing makes it so that changing the number of nodes only remaps a small, localized fraction of keys."*

### Q: "How does it work?"
> *"You hash both the servers and the keys onto a circular ring of hash values. Each key belongs to the first server you reach going clockwise from the key's position. Because a key's home depends on where it sits relative to servers rather than on the total count, adding or removing a node only affects the keys in one arc of the ring — about K/N of them — instead of all of them."*

### Q: "What happens when a node is added or removed?"
> *"On removal, the keys that lived on that node walk clockwise to the next node; every other key is untouched. On addition, the new node sits at a point on the ring and takes over just the arc immediately before it, stealing keys from one neighbor. Either way only about K/N keys move, and the movement is confined to one region of the ring."*

### Q: "What are virtual nodes and why do you need them?"
> *"With few servers, their random positions on the ring are uneven, so one server can own a much bigger arc and get overloaded — and when a node dies its whole load dumps on the single next node. Virtual nodes fix this: each physical server is placed at many points on the ring. That averages the load out evenly, and a failure or a new join redistributes across all remaining nodes instead of one. You can also give stronger servers more virtual nodes for a weighted share."*

### Q: "Who uses it?"
> *"Distributed caches like Memcached — it's the original motivation — and databases like Cassandra and DynamoDB use it with virtual nodes to place data. Redis Cluster is a variant that uses 16,384 fixed hash slots rather than a literal ring, but with the same goal of minimal data movement when the cluster changes. Load balancers and CDNs also use it for sticky, cache-affine routing."*

### Q: "Naive modulo vs consistent hashing — how many keys move on a change?"
> *"With `% N`, roughly (N−1)/N of all keys remap — e.g. ~80% going from 4 to 5 servers. With consistent hashing, on average only K/N move — about 1/5 in the same scenario — and only within one arc of the ring."*

---

<a name="cheatsheet"></a>
# 7. Cheat Sheet — everything on one page

### The problem
- Naive `server = hash(key) % N` → change N and ~**(N−1)/N of keys remap** (~80% on 4→5).
- Cache: mass miss → **DB stampede**. Sharded DB: move ~all the data. Both unacceptable.

### The ring
- Hash values `0 … 2³²−1` on a **circle** (wraps around).
- Hash **servers** and **keys** onto the same ring.
- Key belongs to the **first server clockwise**.
- Key's home depends on **position relative to servers**, not on **count N**.

### Add / remove a node
- Remove → that node's keys go to the **next clockwise** node; rest untouched.
- Add → new node takes **one arc** from one neighbor.
- Only ~**K/N keys move**, localized to one arc.

### Virtual nodes (vnodes / replicas)
- Problem: few nodes → lumpy arcs (hotspot); a death dumps all load on one neighbor.
- Fix: each physical node at **many** ring points (e.g. 100–200).
  - Even load (law of large numbers) · graceful failure (spreads across all) · weighted (more vnodes = bigger share).

### Used by
Memcached (client sharding) · Cassandra · DynamoDB · Redis Cluster (variant: 16,384 hash slots) · LBs/CDNs (sticky, cache-affine routing).

### Connects to
- Part 21: how sharding decides a key's node without reshuffling on scale.
- Part 5 / 5.5: distributed caching — avoiding the stampede.
- Part 2.5: load balancer sticky/affinity routing.

### Suggested next topics
- **Observability** — logging, metrics, tracing, health checks.
- **Idempotency & Saga** — distributed transactions (extends Part 13).
- **Search / inverted index** (Elasticsearch).

*— End of Part 24 —*
