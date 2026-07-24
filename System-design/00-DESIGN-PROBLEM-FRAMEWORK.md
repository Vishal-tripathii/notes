# 🎯 System Design Problem — Master Framework & Checklist

> **Purpose:** the step-by-step attack plan for ANY design problem (URL shortener, Twitter, chat, Dropbox…). Work through these stages IN ORDER. Each stage links to the study-notes Part that explains it. **Don't skip the "depth boosters" — they're what separate a basic answer from a senior one.**

---

## The 9-step flow (say it out loud, in order)

```
1. Requirements      → what + how well
2. Estimation        → the numbers
3. API design        → the contract
4. High-level design → boxes & arrows
5. Core deep-dive    → the ONE hard part of THIS problem
6. Database          → store + schema
7. Caching           → speed up reads
8. Scaling           → LB + replication + sharding
9. Bottlenecks/extras→ trade-offs, async, reliability
```

---

## 1. Requirements  *(Part 1)*
- **Functional:** core features as "user can ___". **Narrow to 2–4.** Ask what to skip.
- **Non-functional:** availability, latency, consistency, scale. **Always state read-heavy vs write-heavy + the read:write ratio.**
- ✅ Checkpoint: *"Is this read-heavy? What's the ratio?"* (drives caching/replication).

## 2. Capacity Estimation  *(Part 3)*
- **Writes/sec, Reads/sec** (from DAU × actions ÷ seconds/day).
- **Storage** (records × size × years).
- **Bandwidth** if media.
- Derive key sizes (e.g. short-code length via Base62 capacity).
- ✅ Checkpoint: *"~X writes/s, ~Y reads/s, ~Z TB."*

## 3. API Design  *(Part 11)*
- Endpoints: `POST /resource`, `GET /resource/{id}`.
- Nesting for relationships, pagination for lists (cursor for feeds).
- **Protocol details that matter** (e.g. 301 vs 302 redirects, idempotency for payments).

## 4. High-Level Design
- Draw: **Client → LB → App servers → Cache → DB**, plus queues/services.
- Identify the **data flow** for the main read path and write path.

## 5. Core Deep-Dive — the ONE hard part 🎯
- Every problem has a **signature challenge**. Nail it:
  - URL shortener → **unique short-code generation** (counter+Base62 / KGS / hash+collision).
  - Twitter feed → **fan-out** (write vs read).
  - Chat → **real-time delivery** (websockets, ordering).
  - Rate limiter → **the counting algorithm** (fixed/sliding window, token bucket).
  - Dropbox → **chunking + dedup + sync** (Part 20).
- ✅ Checkpoint: *"What's uniquely hard here, and what's my algorithm + trade-off?"*

## 6. Database  *(Parts 8, 9, 10)*
- **SQL vs NoSQL:** relational + transactions → SQL; simple key-value / huge scale / flexible → NoSQL.
- **Schema** + primary key.
- **Index** the columns you query/filter/join (Part 9).
- Relationships → 1:1 / 1:N / M:N; embed vs reference (Part 10).

## 7. Caching  *(Parts 5, 5.5)*
- **Cache-aside** for read-heavy hot data (Redis). Most reads should skip the DB.
- **Redis's 3 jobs to remember:** ① cache ② atomic counter (INCR) ③ rate limiting (INCR+TTL).
- Also: CDN for static/media (Part 2.7).

## 8. Scaling  *(Parts 2, 2.5, 21)*
- **Load balancer** (Part 2.5): single entry point, spread traffic, health checks, HA. Requires **stateless** app servers.
- **Replication** (Part 21): read replicas (read scaling) + failover (HA). Primary = writes.
- **Sharding** (Part 21): split data by a **shard key** when data/writes outgrow one machine.
  - ⭐ **Machine-ID prefix trick:** prefix the ID with a machine ID → unique codes across servers with NO coordination, AND the prefix doubles as the **shard key** (routes the lookup to the right shard). Two problems, one move.
- **Async processing** (Parts 13, 14): push heavy/non-critical work (analytics, emails, thumbnails, virus scan) to a **queue** so the hot path stays fast.

## 9. Bottlenecks, Trade-offs & Reliability
- **No single point of failure** — redundant LB, replicated DB (Part 2.5, 21).
- **Consistency vs availability** — CAP choice per feature (Part 4).
- **Failure handling** — retries, dead-letter queues, idempotency (Parts 11, 13).
- **Rate limiting / abuse** (Parts 5.5, 11).
- State the **trade-offs** you're accepting out loud.

---

## ⭐ DEPTH BOOSTERS — always cover these (the "senior answer" checklist)

These are the points that are easy to forget but expected in a strong answer:

- [ ] **Load balancer** — where it sits, why (spread + HA), stateless servers.
- [ ] **Redis** — cache (read-heavy), atomic counter, rate limiting.
- [ ] **How to scale for high traffic** — cache → horizontal app → replicas → shard → async.
- [ ] **Sharding + shard key** — how data is split; **machine-ID prefix as shard key** where relevant.
- [ ] **Replication + failover** — read scaling + high availability.
- [ ] **Protocol/detail choices** — e.g. **301 vs 302**, cursor pagination, idempotency.
- [ ] **Async/queue** — keep heavy or non-critical work off the hot path.
- [ ] **CDN** — for static assets / media / hot content.
- [ ] **Bottleneck + trade-off** — name the weakest link and what you'd do.

---

## Quick mental template (one-liner per stage)

> **Requirements** (read-heavy? ratio?) → **Estimate** (QPS, storage) → **API** (+ protocol details) → **Draw** (client→LB→app→cache→DB) → **Core deep-dive** (the signature hard part) → **DB** (SQL/NoSQL + schema + index) → **Cache** (Redis cache-aside) → **Scale** (LB + stateless + replicas + shard-by-key + async queue) → **Trade-offs** (CAP, no SPOF, failure handling).

---

## Part index (where each topic lives)
- Requirements → **01** · Estimation/Latency/Throughput → **03**
- Scaling → **02**, LB → **02.5**, Reverse proxy → **02.6**, CDN → **02.7**
- CAP → **04** · Caching → **05**, Redis → **05.5**
- Auth (headers/cookies/JWT/sessions) → **06, 15–19** · HTTPS → **07**
- Databases → **08**, Indexing → **09**, Relationships → **10**
- API → **11**, GraphQL → **12**
- Queues → **13**, Event-driven → **14**
- File upload → **20** · HA/Replication/Sharding → **21** · Design patterns → **22**

*— Use this on EVERY design problem. —*
