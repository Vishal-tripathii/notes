# System Design Study Notes — Part 21

## High Availability: Replication & Sharding

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Analogies, diagrams, and interview Q&A included.
>
> **Consolidates & deepens:** Part 2 (replication/sharding intro), Part 4 (sync/async consistency), Part 8 (replication vs sharding). Ties to Part 2.5 (no single point of failure).

---

## Table of Contents

1. [High Availability — the goal](#ha)
2. [Replication — keeping copies](#replication)
3. [Failover — how replication delivers HA](#failover)
4. [Sync vs Async replication](#sync-async)
5. [Sharding — splitting the data](#sharding)
6. [Replication vs Sharding](#vs)
7. [Interview Q&A](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="ha"></a>
# 1. High Availability (HA) — the goal

**High Availability = the system stays up even when parts of it fail.** No single failure takes everything down.

Measured in **"nines" of uptime**:
| Availability | Downtime/year | Nickname |
|---|---|---|
| 99% | ~3.65 days | two nines |
| 99.9% | ~8.7 hours | three nines |
| 99.99% | ~52 minutes | four nines |
| 99.999% | ~5 minutes | five nines |

**How to achieve HA:** **redundancy** (no single point of failure — Part 2.5) + **failover** (auto-switch to a backup). For data, the main tool is **replication**.

---

<a name="replication"></a>
# 2. Replication — keeping copies

**Replication = keeping copies of your data on multiple machines**, so data survives a failure and reads can be spread out.

## Roles: Primary & Replica
```
              WRITES
[App] ──────────────────▶ [PRIMARY]  (the one authoritative copy)
                              │  streams changes to...
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
            [Replica 1]  [Replica 2]  [Replica 3]   (copies)
                 ▲            ▲            ▲
[App] ──────READS (spread across replicas)──────
```
- **Primary** (master/leader) — the **one** copy that accepts **writes**. All changes go here.
- **Replica** (slave/secondary/follower) — **copies**; the primary streams every change to them.
- **Read Replica** — a replica used to serve **read** queries. Writes → primary; reads → spread across read replicas.

## Analogy: a popular library book 📚
The library keeps **one master copy** where the librarian records updates, plus **many identical shelf copies** so lots of people read at once. Coffee on one copy? Others are fine. Master damaged? Promote a shelf copy to be the new master.
> Master = primary (changes happen here); shelf copies = replicas (everyone reads them).

## Why replicas? (four reasons)
1. **Read scaling** — most systems are read-heavy (Twitter ~100:1). Spread reads across replicas.
2. **High availability / failover** — primary dies → a replica takes over → no downtime.
3. **Geographic locality** — replica near users → faster reads (lower latency, Part 3).
4. **Backups without disruption** — back up from a replica so the primary isn't slowed.

---

<a name="failover"></a>
# 3. Failover — how replication delivers HA

If the **primary dies**, one **replica is promoted** to become the new primary. The system keeps running.
```
Normal:   [Primary] ──▶ [Replica 1] [Replica 2]

Primary dies 💥:
          [Primary ❌]     [Replica 1] [Replica 2]
                              │ promote
                              ▼
          [Replica 1 = NEW PRIMARY] ──▶ [Replica 2]   (writes resume, data intact)
```
- **Automatic failover** — a monitor detects the primary is down and promotes a replica within seconds; clients are redirected to the new primary.

> **Analogy:** the **vice president** automatically becomes president if the president can't serve. The system never fully stops.

---

<a name="sync-async"></a>
# 4. Sync vs Async replication (consistency trade-off — Part 4)

- **Synchronous** — primary waits until replicas confirm the write before acking. Safe (no data loss on failover) but **slower**.
- **Asynchronous** — primary acks immediately; replicas catch up shortly after. **Fast**, but a tiny window where a failover could lose the latest writes (**replication lag** → eventual consistency, Part 4).

> Most systems use **async** for speed and accept the small lag; use **sync** when you can't lose a single write (e.g. banking).

---

<a name="sharding"></a>
# 5. Sharding — splitting the data

Replication **copies the same data** — but doesn't help when:
- The dataset is **too big for one machine** (every replica holds the *full* copy).
- There are **too many writes** (all writes funnel to one primary).

**Sharding = splitting data into pieces (shards), each on a different machine, holding only its slice.** No single machine holds everything.
```
                   ┌──── Which shard? (by a SHARD KEY) ────┐
                   ▼               ▼               ▼
              [Shard A]       [Shard B]       [Shard C]
              users 1–1M      users 1M–2M     users 2M–3M
              (its own DB)    (its own DB)    (its own DB)
```

## The shard key
Pick a **shard key** (e.g. `userId`) + a rule:
- **Range-based** — by value ranges (users 1–1M → Shard A). Simple; can create **hotspots**.
- **Hash-based** — hash the key → pick a shard. Even spread, avoids hotspots; range queries harder.

## Analogy: a library too big for one building 🏛️
One building can't hold every book → split across buildings: **A–H in Building 1, I–P in Building 2, Q–Z in Building 3.** Each holds a *different* slice; find a book by going to the right building (shard) based on its title (shard key).
> Replication = many copies of the *same* library. Sharding = *one* library split across buildings.

## Why shard? (usage)
1. **Storage** — 3B rows won't fit on one machine → 30 shards × 100M each.
2. **Write scaling** — writes for Shard A go to A's machine, B's to B's → **writes happen in parallel** (unlike replication, where all writes hit one primary).

## Trade-offs (serious)
- **Cross-shard queries painful** — "all users who joined this year" hits *every* shard + merges (scatter-gather).
- **Cross-shard joins** hard/expensive.
- **Hotspots** — a bad shard key overloads one shard.
- **Resharding is hard** — adding shards means moving huge data.
> Shard only when you **must** — one machine genuinely can't hold the data or absorb the writes.

---

<a name="vs"></a>
# 6. Replication vs Sharding (key distinction)

| | **Replication** | **Sharding** |
|---|---|---|
| Does | **Copies** the *same* data | **Splits** *different* data |
| Scales | **Reads** (+ high availability) | **Storage + writes** |
| Each machine has | The **full** dataset | **One slice** |
| Main win | Fault tolerance + read scaling | Huge data + parallel writes |
| Cost | Replication lag (stale reads) | Hard cross-shard queries; complexity |

## They combine — real-world setup
Shard for size/writes, then **replicate each shard** for read-scaling + HA:
```
   ┌──── Shard A ────┐        ┌──── Shard B ────┐
   │ [Primary A]     │        │ [Primary B]     │
   │   ├─[Replica A1]│        │   ├─[Replica B1]│
   │   └─[Replica A2]│        │   └─[Replica B2]│
   └─────────────────┘        └─────────────────┘
```
- Sharding → data *divided* (scales storage + writes).
- Replication → each slice *duplicated* (scales reads + survives failure).

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: "What is replication and why use replicas?"
> *"Replication is keeping copies of your data on multiple machines. A primary handles all writes, and replicas copy the primary's data and serve reads. You use replicas for four reasons: read scaling, since most systems are read-heavy and you spread reads across replicas; high availability, because if the primary fails a replica is promoted to take over; geographic locality, putting a replica near users for lower latency; and backups without slowing the primary."*

### Q: "What is failover?"
> *"Failover is how replication provides high availability. If the primary dies, a monitoring system detects it and promotes a replica to become the new primary, usually within seconds, so writes resume and the system stays up — like a vice president automatically taking over. With synchronous replication no data is lost; with async there's a tiny window where the latest writes could be lost."*

### Q: "Read replica vs primary?"
> *"The primary is the single authoritative copy that handles all writes. Read replicas are copies that serve read queries. Writes go to the primary and reads spread across the replicas, which scales reads massively for read-heavy systems. The trade-off is replication lag — replicas can be a moment behind, so reads might be slightly stale."*

### Q: "Replication vs sharding — what's the difference?"
> *"They solve different problems. Replication copies the same data to multiple machines — it scales reads and gives high availability, but every machine still holds the full dataset, so it doesn't help if the data is too big or writes are too many. Sharding splits different data across machines, each holding one slice — it scales storage and writes because writes happen in parallel. Replication is copies of the same data; sharding is different data on each machine. Big systems do both: shard for size, then replicate each shard for availability."*

### Q: "When would you shard, and what's the downside?"
> *"I'd shard when one machine can't hold the data or handle the write volume — replication doesn't help there because all writes still hit one primary and every replica holds the full data. The downside is complexity: cross-shard queries and joins become expensive since data is spread out, a bad shard key creates hotspots, and resharding later means moving huge amounts of data. So I'd only shard when I genuinely must."*

### Q: "How do you achieve high availability for a database?"
> *"Replication with automatic failover and no single point of failure. I'd run a primary with multiple replicas across different machines, ideally different availability zones, so if the primary or a whole zone fails, a replica is promoted automatically. The replicas also spread read load. For very large systems I'd shard and replicate each shard. The goal is that any single failure is survived without downtime."*

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet

### High Availability
- **HA** = stay up despite failures. Measured in **nines** (99.9% ≈ 8.7h/yr, 99.99% ≈ 52min/yr).
- Achieved by **redundancy** (no single point of failure) + **failover**.

### Replication (copies of the SAME data)
- **Primary** = handles writes. **Replica** = copies, serve reads. **Read replica** = replica for read queries.
- **Why replicas:** read scaling · high availability (failover) · geo-locality · non-disruptive backups.
- **Failover** = promote a replica when the primary dies (VP becomes president).
- **Sync** = safe, slower (no data loss). **Async** = fast, tiny lag (eventual consistency).
- Analogy: master copy + many shelf copies of a library book.

### Sharding (SPLIT different data)
- Split data across machines by a **shard key**; each holds one slice.
- **Range-based** (ranges; hotspots) vs **hash-based** (even; range queries harder).
- **Why:** storage (too big for one machine) + write scaling (parallel writes).
- **Cost:** cross-shard queries/joins hard · hotspots · resharding painful.
- Analogy: one library split across buildings A–H / I–P / Q–Z.

### Replication vs Sharding
| | Replication | Sharding |
|---|---|---|
| Does | Copies same data | Splits different data |
| Scales | Reads + HA | Storage + writes |
| Each machine | Full dataset | One slice |
| Cost | Replication lag | Cross-shard complexity |
- **Combine:** shard for size → replicate each shard for reads/HA.

### Connects to
- Part 2: intro. · Part 4: sync/async (CAP). · Part 8: replication vs sharding. · Part 2.5: no single point of failure. · Part 3: geo-latency.

### Suggested next (storage phase)
- **Object vs block vs file storage**.
- **Design Google Drive / Dropbox**.
- **Full system design walkthrough**.

*— End of Part 21 —*
