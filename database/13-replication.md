# Database Study Notes — Part 13

## Replication

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Primary/secondary & read replicas](#primary-secondary)
2. [Why use read replicas](#why-replicas)
3. [Replication lag and read-after-write consistency](#lag)
4. [Interview Questions & Answers](#interview)
5. [Cheat Sheet](#cheatsheet)

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

---

<a name="interview"></a>
## 4. Interview Questions & Answers

**Q: Why would you use read replicas?**
A: To spread read load off the primary (since reads usually vastly outnumber writes), to reduce latency by placing a replica geographically closer to users, and to provide a failover target if the primary goes down.

**Q: What's the concrete bug replication lag causes?**
A: Write to the primary, then immediately read from a replica that hasn't caught up yet — the client doesn't see their own just-made write. A real, common production symptom ("I just saved this and it's showing the old value"), not a theoretical edge case.

**Q: How would you handle the read-your-own-write problem with replicas?**
A: Route reads back to the primary for a short window after a write from that same client (or for any operation where read-after-write consistency actually matters), or track lag and steer reads away from replicas that have fallen too far behind. For data where a few seconds of staleness genuinely doesn't matter (a public feed), accepting eventual consistency is also a legitimate choice.

---

<a name="cheatsheet"></a>
## 5. Cheat Sheet

- Primary accepts writes; secondaries replicate from it and typically serve reads.
- Read replicas: spread read load, reduce geographic latency, provide failover targets.
- Replication lag = secondary is behind the primary by some variable amount.
- Concrete bug: write to primary, immediately read from a lagging replica → don't see your own write.
- Mitigate with: read-your-writes-from-primary, lag-aware read routing, or accepting eventual consistency where it's tolerable.
