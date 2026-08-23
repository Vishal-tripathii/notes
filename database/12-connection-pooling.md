# Database Study Notes — Part 12

## Connection Pooling

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Why a connection per request is expensive](#why-expensive)
2. [Pool size trade-offs](#pool-size)
3. [Connection leaks](#leaks)
4. [Interview Questions & Answers](#interview)
5. [Cheat Sheet](#cheatsheet)

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

<a name="interview"></a>
## 4. Interview Questions & Answers

**Q: Why is opening a fresh database connection per request expensive?**
A: It's not just a socket — TCP handshake, often TLS negotiation, authentication, and the database server allocating its own per-connection resources, all repeated on every request and torn down immediately after. A connection pool pays that setup cost once per connection instead of once per request.

**Q: What happens if a connection pool is too small? Too large?**
A: Too small — requests queue for an available connection even though the database itself has spare capacity, an artificial bottleneck. Too large — the database's own finite connection limit and per-connection resource overhead gets exhausted, especially once multiplied across multiple app instances each with their own pool, which can hurt worse than being too small.

**Q: What's a connection leak, and why is it a particularly nasty kind of bug?**
A: A connection checked out and never returned to the pool, usually from a missing release on an error path. It's dangerous because it's slow and silent — the pool doesn't break immediately, it just quietly shrinks over time until it's fully starved, at which point the service looks completely down with no obvious single trigger, since nothing actually crashed.

---

<a name="cheatsheet"></a>
## 5. Cheat Sheet

- Fresh connection per request = TCP handshake + TLS + auth + server-side resource allocation, all repeated and torn down every time — expensive at any real volume.
- Pool = open a fixed set once, reuse, return to pool when done.
- Too small pool → artificial queuing. Too big pool → exhausts the database's own connection limit, worse across multiple app instances.
- Connection leak = checked out, never released (usually a missing `finally`) → pool quietly starves over time → total outage with no obvious trigger.
