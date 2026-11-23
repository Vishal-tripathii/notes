# Database Study Notes — Part 12

## Connection Pooling

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Why a connection per request is expensive](#why-expensive)
2. [Pool size trade-offs](#pool-size)
3. [Connection leaks](#leaks)
4. [External poolers (PgBouncer) & serverless](#pgbouncer)
5. [Sizing a pool — a starting formula](#sizing)
6. [MongoDB / Mongoose pooling](#mongo)
7. [Interview Questions & Answers](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="why-expensive"></a>
## 1. Why opening a DB connection per request is expensive

Establishing a fresh database connection isn't just "open a socket" — it involves a **TCP handshake**, often **TLS negotiation**, **authentication** against the database, and the database server **allocating its own per-connection resources** (memory buffers, a backend process/thread in many engines). Doing all of that on every single request, then tearing it down, adds real latency to every request and real overhead to the database server — at any meaningful request volume this becomes the dominant cost, not the actual query.

A **connection pool** solves this by opening a fixed set of connections **once**, keeping them alive, and handing them out to requests as needed, returning them to the pool when the request finishes — paying the expensive setup cost once per connection instead of once per request.

---

<a name="pool-size"></a>
## 2. Pool size trade-offs

Neither direction is free:

- **Too small:** requests queue up waiting for a connection to free up, adding latency even though the database itself isn't actually overloaded — the bottleneck is artificial, created by the pool configuration rather than real capacity.
- **Too big:** the database server itself has a finite connection limit and finite per-connection resource overhead — too many open connections (especially multiplied across multiple app server instances, each with its own pool) can exhaust the database's own memory/resources, sometimes causing more harm than the "too small" case it was meant to avoid.

The right size depends on actual concurrent load and the database's own connection limit — it's a tuned value based on observed behavior, not a default left unexamined, especially in a horizontally-scaled deployment where **pool size × number of app instances** has to stay under the database's real ceiling.

---

<a name="leaks"></a>
## 3. Connection leaks

A **connection leak** is a connection checked out from the pool that's **never returned** — typically because an error path forgot to release it (e.g. an exception thrown between checkout and release, with no `finally`/equivalent cleanup).

**Why it's dangerous specifically because it's slow and silent:** the pool doesn't immediately break — it just has one fewer usable connection. Under normal load this can go unnoticed for a long time. But each leak permanently shrinks the effective pool size, and given enough of them accumulating (a slow, rare error path, but a high-traffic endpoint), the pool eventually runs completely dry — every request starts queuing indefinitely for a connection that will never come back, and the service looks fully down with no obvious single cause, since nothing "crashed," the pool just quietly starved out over time.

```js
// leak-prone — if the query throws, the connection is never released
const conn = await pool.getConnection();
const result = await conn.query('SELECT ...');
conn.release();

// safe — release always runs, even on error
const conn = await pool.getConnection();
try {
  const result = await conn.query('SELECT ...');
} finally {
  conn.release();
}
```

---

<a name="pgbouncer"></a>
## 4. External poolers (PgBouncer) & serverless

**Why Postgres in particular needs this:** every Postgres connection is a separate **OS process** using several MB of memory, so `max_connections` is usually in the low hundreds (default 100). 30 app instances × a pool of 20 = 600 connections — more than the database can hold, even though most of them sit idle at any moment.

An **external pooler** (PgBouncer, pgcat, RDS Proxy) sits between the apps and the database: thousands of cheap client connections in, a few dozen real database connections out.

| PgBouncer mode | A real DB connection is held for | Notes |
|---|---|---|
| session | the whole client session | safest, least sharing |
| **transaction** | one transaction, then returned | the usual choice — high sharing |
| statement | one statement | breaks multi-statement transactions |

**Transaction mode breaks anything that relies on session state**, because your next transaction may run on a different server connection: session-level `SET` (use `SET LOCAL`), session advisory locks ([Part 04.6 §8](04.6-locking-deadlocks-and-anomalies.md)), `LISTEN/NOTIFY`, temp tables, and — on older PgBouncer versions — named prepared statements (supported since PgBouncer 1.21 with `max_prepared_statements`).

**Serverless (Lambda, Vercel functions):** every concurrent function instance has its own pool, and instances scale to hundreds in seconds → a **connection storm** that exhausts the database. Mitigations: a proxy (RDS Proxy, PgBouncer, Atlas's built-in pooling, or HTTP-based drivers like Neon's), a pool size of **1–2 per instance**, and creating the client **outside** the handler so warm invocations reuse it.

---

<a name="sizing"></a>
## 5. Sizing a pool — a starting formula

More connections ≠ more throughput. The database only has so many CPU cores and disks; past that point, extra active connections just add context switching and lock contention, and **latency rises while throughput stays flat**.

Two starting points (then measure):
- **PostgreSQL wiki / HikariCP rule of thumb:** `connections ≈ (CPU cores × 2) + effective disk spindles` — for an 8-core database server, roughly 17–20 connections **in total across all app instances** doing active work.
- **Little's Law** for the app side: `connections needed ≈ queries/sec × average query time`. 2,000 queries/sec × 5ms = 10 connections busy on average; add headroom for spikes.

So a fleet of 20 app instances might use a pool of 5 each (100 client connections) behind PgBouncer, which keeps ~20 real connections to the database. If requests queue for connections while the database CPU is idle, the pool is too small; if database CPU and latency climb while more connections are active, it's too big.

---

<a name="mongo"></a>
## 6. MongoDB / Mongoose pooling

- The MongoDB Node driver pools automatically: **`maxPoolSize` default 100** per `MongoClient` (per server it talks to), plus `minPoolSize`, `maxIdleTimeMS`, and **`waitQueueTimeoutMS`** (how long a request waits for a free connection before erroring).
- **Create one `MongoClient` / one `mongoose.connect()` per process at startup and reuse it.** Calling `connect()` per request creates a new pool each time — the most common Mongo pooling bug, and a quick way to hit Atlas connection limits.
- MongoDB connections are threads, cheaper than Postgres processes, but the server still has limits (Atlas tiers cap connections) — the `instances × maxPoolSize` arithmetic still applies, especially with serverless.
- A long-running operation (unindexed aggregation, big export) holds a pooled connection the whole time; enough of them and normal requests wait in the queue — add `maxTimeMS` ([Part 25 §7](25-database-observability.md)).

---

<a name="interview"></a>
## 7. Interview Questions & Answers

**Q: Why is opening a fresh database connection per request expensive?**
A: It's not just a socket — TCP handshake, often TLS negotiation, authentication, and the database server allocating its own per-connection resources, all repeated on every request and torn down immediately after. A connection pool pays that setup cost once per connection instead of once per request.

**Q: What happens if a connection pool is too small? Too large?**
A: Too small — requests queue for an available connection even though the database itself has spare capacity, an artificial bottleneck. Too large — the database's own finite connection limit and per-connection resource overhead gets exhausted, especially once multiplied across multiple app instances each with their own pool, which can hurt worse than being too small.

**Q: What's a connection leak, and why is it a particularly nasty kind of bug?**
A: A connection checked out and never returned to the pool, usually from a missing release on an error path. It's dangerous because it's slow and silent — the pool doesn't break immediately, it just quietly shrinks over time until it's fully starved, at which point the service looks completely down with no obvious single trigger, since nothing actually crashed.

**Q: What's PgBouncer for, and what breaks in transaction mode?**
A: Postgres connections are heavyweight processes, so many app instances with their own pools can exceed `max_connections`. PgBouncer multiplexes many client connections onto a few real ones. In transaction mode a connection is returned after each transaction, so session state doesn't survive: session `SET`, session advisory locks, `LISTEN/NOTIFY`, temp tables, and prepared statements on old versions.

**Q: How do you size a connection pool?**
A: Start from the database's capacity, not the app's: roughly cores × 2 + disks active connections in total, and Little's Law (queries/sec × average query time) for what the app needs. Divide across instances, then measure — queuing with idle DB CPU means too small; rising latency with more active connections means too big.

**Q: Why do serverless functions cause database connection problems?**
A: Each concurrent instance has its own pool, and instances scale to hundreds quickly, so connections explode. Use a proxy (RDS Proxy, PgBouncer, Atlas pooling), a pool of 1–2 per instance, and create the client outside the handler so warm invocations reuse it.

---

<a name="cheatsheet"></a>
## 8. Cheat Sheet

- Fresh connection per request = TCP handshake + TLS + auth + server-side resource allocation, all repeated and torn down every time — expensive at any real volume.
- Pool = open a fixed set once, reuse, return to pool when done.
- Too small pool → artificial queuing. Too big pool → exhausts the database's own connection limit, worse across multiple app instances.
- Connection leak = checked out, never released (usually a missing `finally`) → pool quietly starves over time → total outage with no obvious trigger.
- Postgres connection = OS process → low `max_connections` → **PgBouncer** (transaction mode; no session state: `SET`, advisory locks, LISTEN, temp tables).
- Serverless: pool of 1–2 per instance + a proxy; create the client outside the handler.
- Sizing: ~cores × 2 + disks total active connections; Little's Law = QPS × avg query time. More connections past that = more latency, not more throughput.
- Mongo: `maxPoolSize` 100 default, `waitQueueTimeoutMS`; **one client per process**, never `connect()` per request.
