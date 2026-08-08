# 🗄️ Database & MongoDB Study Notes — Master Roadmap

> **Purpose:** the full study plan for the database track — SQL fundamentals, MongoDB in depth, and Redis, in the order a Node/full-stack interview actually probes them. 20 parts, each becoming a note file in this folder (`NN-topic-slug.md`), written after the topic is explained in chat — same convention as [Angular](../Angular/00-ROADMAP.md), [nodejs](../nodejs/), and [javascript](../javascript/00-ROADMAP.md).
>
>
> **Target:** interview-ready for a Node.js + MongoDB role (per [the JD this repo is tracking](../nodejs/JD-NodeFullStack-3YR-QNA.md)) — SQL to the depth a full-stack interview expects (joins, indexes, transactions), MongoDB in real depth since it's a JD must-have, Redis to the depth it's actually used (caching, not Redis-as-a-database).

---

## How to study each part

Same method as the other tracks, adapted for a data topic:

```
1. Concept        → what it is, in one sentence
2. Why it exists  → what problem existed before it, what broke without it
3. How internally → what the engine/driver actually does (index structure, execution plan, wire protocol)
4. Write it       → real queries/aggregations against a real dataset — not read, run
5. Break it       → the common mistake, deliberately made (missing index, N+1, unbounded scan)
6. Answer it      → the interview questions, spoken aloud
7. Compress it    → the cheat sheet at the end of each note
```

Step 3 is the one that turns "I know the syntax" into "I can explain why it's slow" — the actual bar these interviews set.

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | SQL Basics | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 01 | Joins | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 02 | SQL Indexes | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 03 | Query Optimization & `EXPLAIN` | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 04 | Transactions & ACID | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 05 | MongoDB Fundamentals | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 06 | MongoDB Indexes | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 07 | Populate & the N+1 Problem | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 08 | Aggregation Pipeline | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 09 | Schema Design — Embedding vs Referencing | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 10 | Pagination | ⭐⭐⭐⭐☆ | ⬜ not started |
| 11 | Redis Basics & Caching | ⭐⭐⭐⭐☆ | ⬜ not started |
| 12 | Connection Pooling | ⭐⭐⭐☆☆ | ⬜ not started |
| 13 | Replication | ⭐⭐⭐☆☆ | ⬜ not started |
| 14 | Sharding | ⭐⭐⭐☆☆ | ⬜ not started |
| 15 | MongoDB Transactions & Concurrency | ⭐⭐⭐☆☆ | ⬜ not started |
| 16 | Advanced SQL (Window Functions, CTEs, Full-Text Search) | ⭐⭐☆☆☆ | ⬜ not started |
| 17 | Advanced Indexing & Partitioning | ⭐⭐☆☆☆ | ⬜ not started |
| 18 | Production Scenario Practice | ⭐⭐⭐⭐⭐ | ⬜ not started |
| 19 | Machine Coding — Query & Aggregation Practice | ⭐⭐⭐⭐☆ | ⬜ not started |

> Nothing written yet — parts get filled in as we study them together.

---

# PHASE 0 — SQL Foundations

> Even on a Mongo-first JD, interviewers use SQL to test whether you understand relational concepts at all — skipping this phase is the single easiest way to look junior in a DB round.

## Part 00 — SQL Basics ⭐⭐⭐⭐⭐

**Topics:** `SELECT` · `WHERE` · `GROUP BY` · `HAVING` · `ORDER BY` · `LIMIT` · `DISTINCT` · aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`).

**Must be able to answer:** `WHERE` vs `HAVING` (filters rows before vs after grouping) · `COUNT(*)` vs `COUNT(column)` (the latter skips `NULL`s) · `DISTINCT` vs `GROUP BY` when the result looks the same.

## Part 01 — Joins ⭐⭐⭐⭐⭐

**Topics:** `INNER JOIN` · `LEFT JOIN` · `RIGHT JOIN` · `SELF JOIN` · `CROSS JOIN`.

**Must be able to answer:** `LEFT` vs `INNER JOIN`, with a concrete case where the row count differs · why you'd use a `SELF JOIN` (e.g. employee → manager in the same table) · how the database actually executes a join (nested loop vs hash join vs merge join, at a high level).

## Part 02 — SQL Indexes ⭐⭐⭐⭐⭐

**Topics:** why indexes exist · B-Tree structure · Composite (multi-column) indexes · Covering indexes · Clustered vs Non-clustered · the left-most prefix rule.

**Must be able to answer:** why indexes make reads fast (and why that's not free) · why indexes slow down writes · "why isn't my index being used" — the standard culprits (leading wildcard `LIKE '%x'`, a function applied to the indexed column, wrong leftmost-prefix order in a composite index).

## Part 03 — Query Optimization & `EXPLAIN` ⭐⭐⭐⭐⭐

**Topics:** reading an `EXPLAIN`/execution plan · full table scan vs index scan · when the optimizer chooses a scan over an available index (and why that can be *correct*, not a bug).

**Hands-on:** the "API suddenly became slow" scenario — given a query and a schema, diagnose it via `EXPLAIN` before touching code.

**Must be able to answer:** how you'd optimize a slow SQL query, as a process, not a one-liner · what to look for in `EXPLAIN` output.

## Part 04 — Transactions & ACID ⭐⭐⭐⭐⭐

**Topics:** Atomicity, Consistency, Isolation, Durability · `COMMIT` / `ROLLBACK` · isolation levels (Read Uncommitted → Serializable) · dirty read · phantom read · non-repeatable read.

**Must be able to answer:** explain ACID with a concrete example per letter · why you'd use a transaction (the "transfer money between two accounts" example, and what breaks without one) · what a dirty read actually looks like in practice.

---

# PHASE 1 — MongoDB core

> This phase is the one that maps directly onto the JD's "Nodejs, MongoDB" must-have — give it the most real time in this track.

## Part 05 — MongoDB Fundamentals ⭐⭐⭐⭐⭐

**Topics:** Documents · Collections · BSON (and how it differs from JSON — types like `ObjectId`, `Date`, binary data that plain JSON can't express) · CRUD operations · `ObjectId` (structure: timestamp + machine + process + counter, and why that makes it roughly sortable by creation time).

**Must be able to answer:** why MongoDB over a relational DB, honestly (schema flexibility, natural fit for nested/document-shaped data) and its real trade-off (no cross-collection joins the way SQL has them, until `$lookup`) · what's actually inside an `ObjectId`.

## Part 06 — MongoDB Indexes ⭐⭐⭐⭐⭐

**Topics:** single-field index · compound index (and field order mattering, same left-most-prefix logic as SQL) · text index · TTL index (auto-expiring documents — sessions, verification codes).

**Hands-on:** the classic scenario — *"10 million users, searching by email is slow."* Walk it as a chain: why slow? → `COLLSCAN`? → check with `explain()` → add `{ email: 1 }` → does it need to be unique? → `{ unique: true }` → why not just add 20 indexes on everything? → because every index costs storage, write throughput, and memory, so indexing is a deliberate trade-off, not a default reflex.

**Must be able to answer:** why compound index field order matters · what a "covered query" is (the query is answered entirely from the index, without touching the actual documents).

## Part 07 — Populate & the N+1 Problem ⭐⭐⭐⭐⭐

**Topics:** `populate()` · the N+1 query problem in general (not Mongo-specific — this is the same shape of bug as an ORM lazy-loading issue in any stack) · `populate()` vs `$lookup` · `.lean()` and when it's safe to use.

**Must be able to answer:** why `populate()` can get slow at scale · why it avoids N+1 the way it's normally used (and how you'd still create an N+1 bug with it inside a loop) · when *not* to use `populate()` (write-heavy paths, when you only need one field from the related doc).

## Part 08 — Aggregation Pipeline ⭐⭐⭐⭐⭐

**Topics:** `$match` · `$group` · `$project` · `$sort` · `$lookup` · `$unwind` — and the pipeline as a sequence of stages, each one transforming what the next stage sees.

**Must be able to answer:** `$lookup` vs `populate()` (both do the join-like thing; `$lookup` runs inside the DB and can be combined with other pipeline stages, `populate()` is a Mongoose-level convenience running as separate queries) · why `$match` should come first when possible (it shrinks the working set before the expensive stages run).

## Part 09 — Schema Design — Embedding vs Referencing ⭐⭐⭐⭐⭐

**Topics:** when to embed a sub-document vs reference by id, worked through concrete cases: User + Address (embed — always fetched together, rarely huge) · User + Orders (reference — orders grow unbounded, queried independently) · Blog + Comments (depends on comment volume and access pattern) · Chat Messages (reference — unbounded, high write volume).

**Must be able to answer:** the actual decision factors — how often the data is read together, how large the embedded array could grow (the 16MB document size cap is a real constraint here), how often the sub-data is queried independently of the parent.

---

# PHASE 2 — Scaling & production concerns

## Part 10 — Pagination ⭐⭐⭐⭐☆

**Topics:** offset pagination (`skip`/`limit`) vs cursor pagination (`_id`-based or timestamp-based "give me everything after X").

**Must be able to answer:** why offset pagination gets slower and less correct the deeper you page (skipped documents still have to be scanned past, and concurrent inserts/deletes shift the "page") · why cursor pagination stays O(1)-ish regardless of depth, and what it gives up (no "jump to page 7").

## Part 11 — Redis Basics & Caching ⭐⭐⭐⭐☆

**Topics:** why cache at all · the cache-aside pattern (read: check cache → miss → read DB → populate cache; write: update DB → **delete**, don't update, the cache key) · TTL as a backstop · cache invalidation on CRUD · cache stampede (many requests missing the same key simultaneously) and mitigations (locking, request coalescing, staggered TTLs).

⚠️ This is already covered in chat depth for the "CRUD + stale cache" scenario specifically — worth turning that conversation into this part's actual content rather than re-deriving it from scratch. Good candidate for a [scenario-bank](../scenario-bank/) entry too, per that folder's workflow.

**Must be able to answer:** why delete-on-write beats update-on-write for cache invalidation · what a cache stampede is and one way to prevent it.

## Part 12 — Connection Pooling ⭐⭐⭐☆☆

**Topics:** why opening a DB connection per request is expensive (TCP handshake, auth, resource allocation) · pool size trade-offs (too small = requests queue waiting for a connection; too big = the DB server runs out of its own resources) · connection leaks (a connection checked out and never released) as a slow, silent outage.

## Part 13 — Replication ⭐⭐⭐☆☆

**Topics:** primary/secondary · read replicas · replication lag and what it means for read-after-write consistency.

**Must be able to answer:** why use read replicas (spread read load, geographic latency) · the concrete bug replication lag causes (write to primary, immediately read from a lagging replica, don't see your own write).

## Part 14 — Sharding ⭐⭐⭐☆☆

**Topics:** horizontal scaling by splitting data across multiple servers · shard key selection and why a bad shard key (e.g. a monotonically increasing one) creates a hot shard.

**Must be able to answer:** sharding vs replication — different problems (write/storage scaling vs read scaling + availability) that are often used together, not alternatives to each other.

## Part 15 — MongoDB Transactions & Concurrency ⭐⭐⭐☆☆

**Topics:** multi-document ACID transactions in MongoDB (available, but a heavier tool than in a relational DB — schema design usually tries to avoid needing them via embedding) · optimistic locking (version field, retry on conflict) vs pessimistic locking (lock and block) · MVCC as the general concept underneath "readers don't block writers."

**Must be able to answer:** how you'd prevent two concurrent requests from both decrementing the same inventory count below zero · optimistic vs pessimistic locking, with a scenario where each wins.

---

# PHASE 3 — Advanced / lower priority

> Read only if the earlier phases are solid and there's time left.

## Part 16 — Advanced SQL ⭐⭐☆☆☆

**Topics:** Window Functions · CTEs (Common Table Expressions) · Full-Text Search.

## Part 17 — Advanced Indexing & Partitioning ⭐⭐☆☆☆

**Topics:** Partial indexes (index only a subset of rows matching a condition) · Sparse indexes · table Partitioning (splitting one large table into smaller physical pieces, transparent to queries).

---

# PHASE 4 — Interview readiness

## Part 18 — ⭐⭐⭐⭐⭐ Production Scenario Practice

The "what happens when..." questions:

- Why did your API become slow, and how do you diagnose it (walk the full chain: is it the query, missing index, N+1, no caching, connection pool exhaustion)?
- How would you prevent duplicate orders from a double-submitted request? (idempotency key, unique index on an order-reference field)
- How would you handle concurrent inventory updates safely? (Part 15 — optimistic locking or atomic `$inc` with a floor check)
- How would you design a multi-tenant database? (shared collection + tenant id vs collection-per-tenant vs database-per-tenant, and the trade-offs of each)
- Why use a transaction here, specifically — what breaks without one?
- Why use Redis here, specifically — what's actually slow without it?
- How would you scale this database as traffic grows 10×? 100×?

📌 Anything that comes up for real in an interview belongs in [scenario-bank/mongodb.md](../scenario-bank/) or [scenario-bank/cross-cutting.md](../scenario-bank/) per that folder's workflow — this part is the rehearsal set, the scenario bank is the "this actually got asked" log.

## Part 19 — Machine Coding — Query & Aggregation Practice ⭐⭐⭐⭐☆

Write real queries against a real (small, seeded) dataset — not recall syntax from memory:

- A compound-index-backed filter + sort query, verified with `explain()`.
- An aggregation pipeline: top N per group (e.g. top 3 orders per customer).
- A `$lookup`-based join replacing a `populate()` call, and comparing the two.
- A cursor-paginated list endpoint.
- A schema for a small domain (e.g. a blog, or an e-commerce order) with an explicit embed/reference decision for every relationship, justified out loud.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | SQL Basics · Joins · Indexes (SQL & Mongo) · Query Optimization · Transactions & ACID · MongoDB Fundamentals · Populate/N+1 · Aggregation Pipeline · Embedding vs Referencing · Production Scenarios |
| ⭐⭐⭐⭐☆ | Pagination · Redis Caching · Query/Aggregation machine coding |
| ⭐⭐⭐☆☆ | Connection Pooling · Replication · Sharding · Mongo Transactions & Concurrency |
| ⭐⭐☆☆☆ | Advanced SQL · Advanced Indexing & Partitioning |

If you have one week left: SQL joins + indexes + MongoDB indexes + aggregation + embedding-vs-referencing + the production scenario list. Those six carry most database interview rounds on this JD.

---

# Suggested schedule

| Week | Parts |
|---|---|
| 1 | 00 SQL Basics · 01 Joins · 02 SQL Indexes · 03 Query Optimization |
| 2 | 04 Transactions & ACID · 05 MongoDB Fundamentals · 06 MongoDB Indexes |
| 3 | 07 Populate/N+1 · 08 Aggregation Pipeline · 09 Embedding vs Referencing |
| 4 | 10 Pagination · 11 Redis Caching · 12 Connection Pooling |
| 5 | 13 Replication · 14 Sharding · 15 Mongo Transactions & Concurrency |
| 6 | 16 Advanced SQL · 17 Advanced Indexing (only if time allows) |
| 7 | 18 Production Scenarios · 19 Machine Coding + full revision |

A calendar, not a contract — same rule as the other tracks.

---

## Connects to

- **[nodejs track](../nodejs/):** the [JD gap-coverage file](../nodejs/JD-NodeFullStack-3YR-QNA.md) has REST/API-optimization and JWT content that assumes this track's indexing/caching knowledge; the nodejs QNA bank already touches Redis and Mongo in places — this track is where those get their full depth.
- **[System-design track](../System-design/):** replication, sharding, and connection pooling (Parts 12–14) are the database half of most system design answers — expect this track's content to get reused there directly.
- **[scenario-bank/](../scenario-bank/):** Part 18 (Production Scenarios) is the natural feeder — anything that gets asked for real should land in `scenario-bank/mongodb.md` or `cross-cutting.md`.

*— Work through these in order. One part at a time, explained first, written after. —*
