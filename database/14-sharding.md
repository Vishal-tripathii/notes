# Database Study Notes — Part 14

## Sharding

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Horizontal scaling by splitting data](#horizontal)
2. [Shard key selection & hot shards](#shard-key)
3. [Sharding vs replication](#vs-replication)
4. [Interview Questions & Answers](#interview)
5. [Cheat Sheet](#cheatsheet)

---

<a name="horizontal"></a>
## 1. Horizontal scaling by splitting data across multiple servers

Sharding splits **one logical dataset across multiple physical servers** — each shard holds a subset of the data, not a full copy. This is how you scale past what a single machine's storage and write throughput can handle: instead of one server holding all 500M documents, five shards each hold ~100M, and writes are spread across all five instead of bottlenecking on one.

```
Full collection (500M docs)
        │
   split by shard key
        │
┌───────┼───────┬───────┬───────┐
Shard 1  Shard 2  Shard 3  Shard 4  Shard 5
(~100M)  (~100M)  (~100M)  (~100M)  (~100M)
```

A **router** (e.g. MongoDB's `mongos`) sits in front and directs each query to the correct shard(s) based on the shard key, so the application mostly doesn't need to know sharding is happening underneath.

---

<a name="shard-key"></a>
## 2. Shard key selection and why a bad shard key creates a hot shard

The **shard key** is the field used to decide which shard a document lives on. Choosing it well is the single most consequential decision in a sharded system — it can't be easily changed after the fact once data is distributed.

**The classic bad shard key: a monotonically increasing value** (like an auto-incrementing ID or a raw timestamp). Because new documents always have the *newest, highest* value, they all route to the **same shard** — the one currently responsible for the highest range of that key. Every single new write lands on one shard while the others sit idle: a **hot shard**, defeating the entire purpose of spreading write load.

**Better shard keys** distribute writes evenly — a hashed version of an ID (spreads writes randomly across shards regardless of ID ordering), or a naturally high-cardinality field where the write pattern isn't correlated with the key's ordering (e.g. `customerId` if customers write roughly evenly, rather than `createdAt`).

---

<a name="vs-replication"></a>
## 3. Sharding vs replication — different problems, often used together

This distinction is a very common interview trap — the two solve **different problems**:

| | Sharding | Replication |
|---|---|---|
| Solves | write/storage scaling — no single server can hold or write all the data | read scaling + availability — multiple copies of the *same* data |
| Each node holds | a **subset** of the data | a **full copy** of the data |
| Adding a node helps | write throughput and total storage capacity | read throughput and failover resilience |

**They're not alternatives — production systems commonly use both together**: a sharded cluster where **each individual shard is itself a replica set** (a primary + secondaries), giving you both write/storage scaling (sharding) and read scaling + availability (replication) at the same time, layered rather than chosen between.

---

<a name="interview"></a>
## 4. Interview Questions & Answers

**Q: When would you shard a database, and how do you choose a shard key?**
A: When a single server can no longer hold the data or handle the write throughput — sharding splits the dataset across multiple servers, each holding a subset. The shard key choice is the critical, hard-to-reverse decision: it needs to distribute writes evenly across shards. A monotonically increasing key (auto-increment ID, raw timestamp) is the classic mistake, since all new writes land on whichever shard currently owns the highest range.

**Q: What happens when your shard key creates a hot partition?**
A: All new writes concentrate on one shard (the one holding the current highest range of a monotonically increasing key) while other shards sit comparatively idle — you've paid the operational complexity of sharding without actually getting the write-throughput benefit, since one shard is still the bottleneck.

**Q: Sharding vs replication — are they alternatives?**
A: No, they solve different problems and are commonly used together. Sharding scales writes/storage by splitting data so each node holds a subset. Replication scales reads and provides availability by giving each node a full copy of the same data. A production cluster is often sharded, with each individual shard itself being a replica set — both layered together, not chosen between.

---

<a name="cheatsheet"></a>
## 5. Cheat Sheet

- Sharding = split data across servers, each holding a subset — scales writes and total storage.
- Bad shard key = monotonically increasing (auto-increment, raw timestamp) → all new writes hit one shard → hot shard.
- Good shard key = evenly distributes writes (e.g. hashed ID, high-cardinality field uncorrelated with write ordering).
- Sharding (write/storage scaling, subset per node) ≠ Replication (read scaling + availability, full copy per node) — different problems, commonly layered together (each shard is itself a replica set).
- **SQL vs NoSQL:** sharding is native/foundational in MongoDB's design; relational databases can shard too (Vitess, Citus) but it's historically more of a bolt-on with more operational overhead. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
