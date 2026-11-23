# Database Study Notes — Part 13

## Replication

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Primary/secondary & read replicas](#primary-secondary)
2. [Why use read replicas](#why-replicas)
3. [Replication lag and read-after-write consistency](#lag)
4. [Synchronous vs asynchronous replication](#sync)
5. [Failover, split brain & fencing](#failover)
6. [Physical vs logical replication](#physical-logical)
7. [Interview Questions & Answers](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="primary-secondary"></a>
## 1. Primary/secondary & read replicas

- **Primary (master):** the one node that accepts **writes**. All changes originate here.
- **Secondary (replica):** a copy of the primary's data, kept up to date by continuously applying the primary's changes (via a replication log/oplog). Secondaries typically serve **reads only**.

```
Client writes ──▶ Primary ──(replication stream)──▶ Secondary 1
                                                 └──▶ Secondary 2
Client reads ──────────────────────────────────────▶ any of the above
```

---

<a name="why-replicas"></a>
## 2. Why use read replicas

- **Spread read load:** if reads vastly outnumber writes (the common case for most applications), routing reads across multiple replicas means no single node carries the full read traffic — the primary is freed up to focus on writes, and read capacity scales roughly linearly by adding more replicas.
- **Geographic latency:** placing a read replica physically closer to a set of users cuts round-trip latency for their reads, without moving where writes are accepted.
- **Availability:** a replica can be promoted to primary if the original primary fails (see also Part 14 — this is a separate concern from sharding, but the two are often used together).

---

<a name="lag"></a>
## 3. Replication lag and read-after-write consistency

**Replication lag** is the delay between a write landing on the primary and that same change actually being applied on a given secondary — the secondary's data is always *slightly* behind the primary, and how far behind varies with write volume, network conditions, and replica load.

**The concrete bug this causes:** a client writes to the primary, immediately reads from a replica that hasn't caught up yet, and **doesn't see their own write** — the classic "I just updated my profile and it still shows the old data" bug. This is a real, common production issue, not a theoretical edge case, especially under any meaningful write load.

**Mitigations:**
- Read your own writes from the **primary** specifically for a short window after a write (or always, for data where this matters).
- Track replication lag and route reads away from a replica that's fallen too far behind.
- Accept eventual consistency where the use case tolerates it (e.g. a public activity feed, where a few seconds of staleness for other users is fine).
- **In MongoDB specifically:** causally consistent sessions with majority write/read concern give read-your-writes even on secondaries — see [Part 05.5 §6](05.5-mongodb-write-concern-read-concern-read-preference.md).

---

<a name="sync"></a>
## 4. Synchronous vs asynchronous replication

The question is **when the primary tells the client "committed"**:

| Mode | Primary acknowledges after | Data loss if the primary dies | Write latency |
|---|---|---|---|
| **Asynchronous** *(default in Postgres and MySQL)* | its own WAL is durable | yes — the last commits not yet shipped are lost on failover | lowest |
| **Semi-synchronous** (MySQL plugin) | at least one replica has **received** the change | very little | + one network round-trip |
| **Synchronous** (Postgres `synchronous_standby_names`, `synchronous_commit = on`) | named replica(s) have it durably | none for acknowledged commits | + round-trip; **if the sync replica is down, commits stall** unless you allow fallback |
| **Quorum** (Postgres `ANY 1 (r1, r2)`, MongoDB `w: "majority"`) | a majority/any N of replicas | none | + round-trip to the fastest N — tolerates one slow replica |

The trade-off is the CAP/PACELC one ([System-design Part 04](../System-design/04-cap-theorem.md)): stronger guarantees cost write latency and, in pure synchronous mode, availability. Production setups commonly use **quorum** (e.g. 1 of 2 replicas) to avoid both data loss and a single slow replica blocking all writes.

---

<a name="failover"></a>
## 5. Failover, split brain & fencing

**Failover** = promoting a replica when the primary dies. Done by a coordinator: Patroni (with etcd/Consul) or the managed service for Postgres; Orchestrator/Group Replication for MySQL; **built-in elections** in MongoDB replica sets ([Part 05.5 §7](05.5-mongodb-write-concern-read-concern-read-preference.md)).

What can go wrong:
- **Data loss with async replication:** the promoted replica lacks the last commits. When the old primary comes back, its extra writes must be discarded (Postgres `pg_rewind`, MongoDB rollback).
- **Split brain:** a network partition makes the coordinator think the primary is dead; a replica is promoted, but the old primary is alive and still accepting writes from clients that can reach it → two primaries, diverging data.
- **Prevention:** require a **majority/quorum** to elect a primary (the minority side can't), make the old primary **step down** when it loses contact with the majority (MongoDB does this), and **fencing** — actively cut off the old primary (revoke its virtual IP, shut it down via the cloud API, "STONITH") before promoting another.
- **Clients must follow the new primary:** DNS/endpoint updates, driver topology discovery (MongoDB drivers do this automatically), and retrying writes that failed during the switch.
- Failover typically takes seconds to a minute; writes fail during that window, so the app needs retries and idempotency.

---

<a name="physical-logical"></a>
## 6. Physical vs logical replication

- **Physical (streaming) replication** — ship the WAL byte-for-byte ([Part 22 §2](22-storage-internals.md)). Replica is an exact, read-only copy of the whole cluster; same major version required. Used for HA replicas and read replicas.
- **Logical replication** — ship row-level changes (INSERT/UPDATE/DELETE per table), e.g. Postgres publications/subscriptions, MySQL row-based binlog. Can replicate **selected tables**, across **major versions** (zero-downtime upgrades), into a different schema, or into other systems via **change data capture** (Debezium → Kafka → search index / warehouse).
- MongoDB's oplog is logical (idempotent operations), which is what change streams are built on.

---

<a name="interview"></a>
## 7. Interview Questions & Answers

**Q: Why would you use read replicas?**
A: To spread read load off the primary (since reads usually vastly outnumber writes), to reduce latency by placing a replica geographically closer to users, and to provide a failover target if the primary goes down.

**Q: What's the concrete bug replication lag causes?**
A: Write to the primary, then immediately read from a replica that hasn't caught up yet — the client doesn't see their own just-made write. A real, common production symptom ("I just saved this and it's showing the old value"), not a theoretical edge case.

**Q: How would you handle the read-your-own-write problem with replicas?**
A: Route reads back to the primary for a short window after a write from that same client (or for any operation where read-after-write consistency actually matters), or track lag and steer reads away from replicas that have fallen too far behind. For data where a few seconds of staleness genuinely doesn't matter (a public feed), accepting eventual consistency is also a legitimate choice.

**Q: Synchronous vs asynchronous replication — trade-off?**
A: Async acknowledges commits before replicas have them — fast, but a failover can lose the last commits. Sync waits for a replica — no loss of acknowledged commits, but every write pays a round-trip and stalls if the sync replica is down. Quorum (any 1 of 2, or majority) is the usual compromise.

**Q: What's split brain, and how is it prevented?**
A: Two nodes both acting as primary after a network partition, accepting conflicting writes. Prevent it by requiring a majority to elect a primary, having a primary step down when it can't see a majority, and fencing the old primary before promoting a new one.

**Q: Physical vs logical replication?**
A: Physical ships the WAL — an exact copy of the whole cluster, same version, for HA and read replicas. Logical ships row changes — selected tables, across versions, into other systems; it's the basis of CDC pipelines and zero-downtime major upgrades.

---

<a name="cheatsheet"></a>
## 8. Cheat Sheet

- Primary accepts writes; secondaries replicate from it and typically serve reads.
- Read replicas: spread read load, reduce geographic latency, provide failover targets.
- Replication lag = secondary is behind the primary by some variable amount.
- Concrete bug: write to primary, immediately read from a lagging replica → don't see your own write.
- Mitigate with: read-your-writes-from-primary, lag-aware read routing, or accepting eventual consistency where it's tolerable. Mongo: causal sessions ([Part 05.5](05.5-mongodb-write-concern-read-concern-read-preference.md)).
- Async (default, may lose last commits on failover) · semi-sync · sync (no loss, latency, stalls) · **quorum** (usual compromise).
- Failover: majority election + step-down + **fencing** prevents split brain; clients must reconnect and retry.
- Physical = WAL copy of everything (HA). Logical = row changes, selected tables, cross-version, CDC.
