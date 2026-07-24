# System Design Study Notes — Part 4

## CAP Theorem (Core + Interview Follow-ups)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, real examples, rehearsed interview scripts, and the full interview follow-up ladder included.
>
> **Continues from:** Parts 1–3. CAP is the **formal law** behind the consistency-vs-availability trade-off you met as an NFR (Part 1) and as strong-vs-eventual consistency (Part 2).

---

## Table of Contents

1. [The core idea](#core)
2. [What is a network partition?](#partition)
3. [Why is CA impossible?](#ca-impossible)
4. [CP vs AP — the two real choices](#cp-ap)
5. [Real examples](#examples)
6. [Redis & MongoDB](#redis-mongo)
7. [Connecting to what I already know](#connect)
8. [Interview follow-ups (the complete surface)](#followups)
9. [Rehearsed interview answers](#rehearsed)
10. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="core"></a>
# 1. The core idea

**CAP theorem:** in a **distributed system** (data spread across multiple machines), when a **network partition** happens, you can only guarantee **two** of these three:

| Letter | Name | Plain meaning |
|---|---|---|
| **C** | **Consistency** | Every read gets the *most recent* write — everyone sees the same, latest data |
| **A** | **Availability** | Every request gets a (non-error) response — the system always answers |
| **P** | **Partition tolerance** | The system keeps working even when the network between machines breaks |

> ⚠️ "Consistency" here = **strong consistency** (every read sees the latest write), the same as in Part 2. It is **NOT** the "C" in ACID. Same word, different meaning.

---

<a name="partition"></a>
# 2. What is a network partition?

A **partition** is when the network between machines **breaks** — messages lost/delayed, nodes **can't talk to each other**, even though each is still running.

```
   Normal:                          Partitioned:
  [Node A] ◀──────▶ [Node B]      [Node A]   ✂ X ✂   [Node B]
       (can talk)                  (can't reach each other)
```

A write arrives at Node A while it's cut off from Node B → **forced decision**:
- **Accept the write on A** (B now has stale data) → chose **Availability**.
- **Reject / error** (refuse until the network heals, so nobody sees inconsistent data) → chose **Consistency**.

**You cannot do both.** That forced choice, during a partition, **is** the CAP theorem.

---

<a name="ca-impossible"></a>
# 3. Why is CA impossible?

**The trick: partition tolerance (P) is not optional.** In any system spread across a network, partitions **will** happen (cables fail, switches die, packets drop). You don't choose whether partitions occur — the network does.

So the real choice is only ever: **"When a partition happens (and it will), do I pick C or A?"**

- **"CA"** = *"I'll guarantee C and A by assuming the network never partitions."* → a fantasy in a distributed system.
- The only genuinely "CA" setup has **no network to partition** — a **single machine**. A single-node DB is technically CA, but it isn't distributed, so CAP doesn't really apply.

> **Honest statement of CAP:** *In a distributed system, partitions are unavoidable, so you must choose between **C** and **A**. "CA" only exists for a single, non-distributed node.* → "CAP is really just C vs. A."

```
Is your system distributed (multiple machines over a network)?
        │                                   │
       NO                                  YES
        ▼                                   ▼
   CA possible                    P is FORCED on you
   (single node)                  → you must pick C or A
                                  → CP  or  AP
```

---

<a name="cp-ap"></a>
# 4. CP vs AP — the two real choices

## CP — Consistency + Partition tolerance (sacrifice Availability)
During a partition, the system **refuses to answer** (errors/timeouts) on the side that can't guarantee fresh data. **Rather be *down* than *wrong*.**
- Some requests fail during a partition, but any answer you *do* get is correct and current.
- **Use when correctness is critical:** banking, payments, inventory, bookings.

## AP — Availability + Partition tolerance (sacrifice Consistency)
During a partition, **every node keeps answering** — even if **stale** — and nodes **reconcile later** once healed (**eventual consistency**). **Rather be *available* than perfectly *consistent*.**
- Always responds, but you might briefly read old data.
- **Use when availability matters more than freshness:** social feeds, likes, catalogs, DNS.

```
                Partition happens ✂
                       │
        ┌──────────────┴──────────────┐
       CP                              AP
   "be right or                    "always answer,
    return an error"                even if stale"
   refuses stale reads             serves, reconciles later
   → some downtime                 → eventual consistency
   Banking, inventory              Social feeds, catalogs
```

---

<a name="examples"></a>
# 5. Real examples

- **Bank ATM network (CP):** if an ATM can't reach the core system (partition), it should **refuse** a large withdrawal rather than risk overdraw from a stale balance. Being *down* beats being *wrong* about money.
- **Social media likes (AP):** during a partition, Instagram still shows the feed and accepts likes; the count may be briefly stale, reconciled later. Staying up matters more than an exact count.
- **Google Docs / collaborative editing (AP-leaning):** keeps letting you type even if sync is disrupted, then merges — availability first.

---

<a name="redis-mongo"></a>
# 6. Redis & MongoDB

## MongoDB → **CP** (favors Consistency)
Uses a **replica set**: one **primary** takes all writes, secondaries replicate (the primary–replica shape from Part 2).
- If a partition cuts the primary off from the **majority**, MongoDB makes it **step down** — stops accepting writes. The minority side goes **unavailable for writes** rather than accept conflicting writes.
- **Result:** sacrifices **availability** to protect **consistency** → **CP**.

## Redis → **AP-leaning** (favors Availability/performance) — with nuance
Genuinely debated and **config-dependent**:
- A **single Redis node** is technically **CA** (no partition possible — one machine).
- **Redis Cluster / replication** uses **asynchronous** replication: the primary confirms a write to the client *before* replicas have it. During a partition, an acknowledged write can be **lost** (if that primary fails and a replica is promoted). It prioritizes speed/availability → usually described as **AP-leaning / weakly consistent**.

> **Interview caveat:** these labels are **simplifications**. Real DBs have **tunable** consistency (dial per-operation toward CP or AP). Saying *"MongoDB leans CP, Cassandra and Redis lean AP, but it's configurable"* shows maturity.

| Database | Leans | Why |
|---|---|---|
| **MongoDB** | **CP** | Primary steps down on partition to avoid conflicting writes |
| **Redis (cluster)** | **AP-ish** | Async replication, favors availability/speed, can lose writes |
| **Cassandra** | **AP** | No master; any node answers; eventual consistency |
| **DynamoDB** | **AP** (tunable) | Always available; eventual by default, strong optional |
| **HBase / Zookeeper / etcd** | **CP** | Refuse to serve rather than return stale data |
| **Traditional SQL (single node)** | **CA** | Not distributed — no partitions |

---

<a name="connect"></a>
# 7. Connecting to what I already know

CAP isn't new — it's the **theory behind Parts 1 & 2**:

- **Part 1:** ranked NFRs — *bank → consistency, social → availability*. **CAP is why that's a trade-off** and not something you can have both of.
- **Part 2:** **strong vs eventual consistency** + **replication** (primary–replica). CAP explains *when* you're forced to choose:
  - **Strong consistency** → the **CP** choice.
  - **Eventual consistency** → the **AP** choice.
- Part 2's line *"you usually can't have instant consistency AND max availability at scale"* **was CAP.** Now you know its name and the reason: **network partitions force the choice.**

```
Part 1: "consistency vs availability" NFR priority
Part 2: strong consistency ↔ eventual consistency (replication lag)
Part 3: latency & throughput (performance metrics)
Part 4: CAP THEOREM ← the formal law that says WHY you must choose
         Strong consistency = CP   |   Eventual consistency = AP
```

---

<a name="followups"></a>
# 8. Interview follow-ups (the complete surface)

## 🔴 Must-know

### 1. The "2 of 3" framing is a trap
Saying *"CAP means pick 2 of 3"* is **misleading**:
- P is **forced** (networks fail), so it's really a choice between **C or A** — and *only during a partition*.
- **With no partition (99.9% of the time), you get BOTH C and A.** CAP only bites *during* a partition.

> **Say this:** *"CAP is often stated as 'pick two of three,' but that's misleading. Partition tolerance isn't optional, so it's really C vs A — and only when a partition is actually happening. Normally you have both."*

### 2. Tunable consistency & Quorums (N, R, W) — the biggest follow-up
Dynamo-style systems (Cassandra, DynamoDB) let you **dial** between C and A:
- **N** = number of replicas of each piece of data
- **W** = replicas that must **ack a write** before it's confirmed
- **R** = replicas that must **respond to a read**

**The magic rule:** if **`R + W > N`** → reads are guaranteed to see the latest write (**strong consistency**), because read and write sets must overlap on an up-to-date replica.

```
N = 3 replicas
W = 2, R = 2  →  R + W = 4 > 3  → STRONG consistency (sets overlap)
W = 1, R = 1  →  R + W = 2 < 3  → fast but EVENTUAL (might miss latest)
```
- **Toward C:** high W (wait for more replicas) → slower, more consistent.
- **Toward A:** low W and R → faster, more available, may read stale.

> Proves CAP is a **spectrum you control per-operation**, not a fixed label.

### 3. PACELC — CAP's modern extension
> **"If Partition (P) → trade Availability vs Consistency; Else (E) → trade Latency vs Consistency."**

CAP only covers the *rare* partition case. But **even when healthy**, keeping replicas consistent **costs latency** (wait for more nodes to agree). So there's *always* a consistency trade-off — with A during partitions, with L the rest of the time.
- **MongoDB** = PC/EC (consistency in both cases)
- **Cassandra/Dynamo** = PA/EL (availability during partition, low latency otherwise)

## 🟡 Good-to-know

### 4. Consistency is a spectrum (not just strong vs eventual)
- **Strong / linearizable** — every read sees the latest write (the "C" in CAP).
- **Causal** — related operations seen in order (a reply never appears before the message).
- **Read-your-own-writes** — you always see your *own* updates (practical middle ground).
- **Monotonic reads** — data never appears to "go backwards."
- **Eventual** — replicas converge *eventually*, no ordering guarantee.

> Knowing *"consistency is a spectrum"* + naming **read-your-own-writes** is valuable.

### 5. CAP "Availability" ≠ your uptime SLA
CAP's Availability = **every request to a non-failing node gets a non-error response** — NOT "99.99% uptime." A CP system (MongoDB) can still be a *highly available product*; it just returns errors *during partitions*. Don't conflate the two.

### 6. ACID vs BASE
- **ACID** (SQL) — Atomicity, Consistency, Isolation, Durability → correctness → **CP-leaning**.
- **BASE** (NoSQL) — **B**asically **A**vailable, **S**oft state, **E**ventual consistency → availability → **AP-leaning**.

### 7. Conflict resolution (how AP systems reconcile after a partition)
- **Last-Write-Wins (LWW)** — keep latest timestamp (simple, can lose data).
- **Vector clocks** — track causality, detect conflicts, app resolves.
- **CRDTs** — data structures that merge automatically without conflict (collaborative editing).
- **Read repair / hinted handoff** — background healing of stale replicas after a partition.

> Naming **LWW** and **CRDTs** is plenty for most interviews.

## 🟢 Nice-to-have (senior / if pushed)
- **Brewer's 2012 retrospective** — the author admitted "2 of 3" was too simplistic; it's about the partition moment (same point as #1).
- **Google Spanner "defeating CAP"** — effectively CP with such high availability it *feels* CA, using synchronized atomic clocks (**TrueTime**).

---

## Priorities — if you lock in only 3 more things
1. **"2 of 3 is misleading — it's really C vs A, only during a partition"** (#1)
2. **Quorums: R + W > N = strong consistency** (#2)
3. **PACELC** — the else-latency half (#3)

## The likely interview ladder (rehearse the whole arc)
```
"Explain CAP"  → your 40-sec answer
   └─▶ "So can't you have all three?"        → P-is-forced / CA-impossible
        └─▶ "Isn't it just pick 2 of 3?"      → the "misleading" correction (#1)
             └─▶ "How would you tune between C and A?" → quorums R+W>N (#2)
                  └─▶ "What about when there's no partition?" → PACELC (#3)
                       └─▶ "How do AP systems fix conflicts?"  → LWW / CRDTs (#7)
```

---

<a name="rehearsed"></a>
# 9. Rehearsed interview answers

### Q: "Explain the CAP theorem" (~30–45 sec)
> *"CAP theorem says that in a distributed system, when a network partition happens — meaning the machines can't talk to each other — you can only guarantee two of three properties: Consistency, Availability, and Partition tolerance. But since networks always fail eventually, partition tolerance isn't really optional, so the real choice is between Consistency and Availability. A CP system, like MongoDB, sacrifices availability during a partition — it returns errors rather than stale data, which you'd want for banking. An AP system, like Cassandra or Redis, stays available but might serve slightly stale data and reconcile later — which is fine for something like social media feeds. That's also why you can't have 'CA' in a real distributed system: you can't wish partitions away, so a single machine is the only truly CA setup."*

*(~40 sec. For ~30s, stop after the MongoDB/Cassandra examples.)*

### Q: "So can't you just have all three?" / "Why is CA impossible?"
> *"Not in a distributed system. Partition tolerance isn't something you choose — networks fail, so partitions will happen whether you like it or not. So when one does, you're forced to pick either Consistency or Availability. The only way to be truly CA is to have no network to partition — a single machine — which isn't distributed."*

### Q: "Isn't CAP just 'pick two of three'?"
> *"That framing is a bit misleading. You don't freely pick two of three, because partition tolerance is forced on you. It's really a choice between Consistency and Availability, and only during an actual partition. When the network is healthy — which is most of the time — you get both C and A."*

### Q: "How would you tune between consistency and availability?"
> *"With quorums. If N is the number of replicas, W is how many must acknowledge a write, and R is how many must respond to a read, then when R plus W is greater than N, the read and write sets overlap, so reads always see the latest write — that's strong consistency. If I lower R and W, I get faster, more available reads and writes but risk reading stale data. So I'd set R+W > N for data that must be current, like a balance, and relax it for data that can tolerate staleness, like a view count."*

### Q: "What happens when there's no partition?" (PACELC)
> *"That's where PACELC extends CAP. If there's a Partition, you trade Availability versus Consistency — that's CAP. But Else — in normal operation — you still trade Latency versus Consistency, because keeping replicas in sync costs time. So even a healthy system has a consistency trade-off; it's just against latency instead of availability."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet — everything on one page

### Core
- **CAP:** in a distributed system, during a **network partition** you can only guarantee **2 of 3**: **C**onsistency, **A**vailability, **P**artition tolerance.
- **C** = every read sees the latest write (strong consistency). **A** = every request gets a non-error response. **P** = keeps working when the network breaks.
- CAP's "C" ≠ ACID's "C". CAP's "A" ≠ uptime SLA.

### The real story
- **P is forced** (networks fail) → the real choice is **C vs A**, and **only during a partition**.
- **No partition → you get both C and A.** CAP only bites during a partition.
- **CA is impossible** in a distributed system → only a **single node** is truly CA.
- "Pick 2 of 3" is **misleading** — it's C vs A.

### CP vs AP
| | **CP** | **AP** |
|---|---|---|
| Sacrifices | Availability | Consistency |
| During partition | Returns errors, refuses stale | Stays up, may serve stale, reconciles later |
| Consistency model | Strong | Eventual |
| Motto | "Be right or fail" | "Always answer" |
| Use for | Banking, inventory, bookings | Social feeds, likes, catalogs, DNS |
| Examples | MongoDB, HBase, Zookeeper, etcd | Cassandra, DynamoDB, Redis-cluster |

### Databases
- **MongoDB → CP** (primary steps down on partition).
- **Redis → AP-ish** (async replication, can lose writes; single node = CA).
- **Cassandra / DynamoDB → AP** (tunable).
- **Single-node SQL → CA** (not distributed).
- *Labels are simplifications — consistency is often tunable.*

### Quorums (tuning C↔A)
- **N** replicas, **W** write acks, **R** read responses.
- **R + W > N ⇒ strong consistency** (read/write sets overlap).
- Low R, W ⇒ fast + available but eventual.

### PACELC
- **If Partition → A vs C; Else → Latency vs C.**
- Consistency has a cost *even without* a partition (it's latency).
- MongoDB = PC/EC; Cassandra = PA/EL.

### Consistency spectrum
Strong → Causal → Read-your-own-writes → Monotonic reads → Eventual.

### Reconciliation (AP systems)
Last-Write-Wins (LWW), Vector clocks, CRDTs, read repair, hinted handoff.

### ACID vs BASE
- **ACID** (SQL) → correctness → CP-leaning.
- **BASE** (NoSQL) → availability + eventual → AP-leaning.

### Connects to
- Part 1: consistency-vs-availability NFR priority.
- Part 2: strong (CP) vs eventual (AP) consistency; replication.

### Suggested next topics
- **Caching** (the biggest latency lever — strategies, eviction, invalidation).
- **Message queues** (async, absorbing spikes).
- **Capacity estimation** (turn user counts into RPS/servers/storage).

*— End of Part 4 —*
