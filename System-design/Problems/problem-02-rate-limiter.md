# Design Problem 02 — Distributed Rate Limiter

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 05.5, 21, 23.
>
> **Signature challenge:** the counting algorithm at scale — a sliding window shared correctly across multiple app-server nodes despite clock skew. **Shape:** write-heavy counter checks on every request.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: the counting algorithm](#core)
5. [The distributed-counter problem](#distributed)
6. [Database](#db)
7. [Caching / Redis](#cache)
8. [Load Balancer](#lb)
9. [Scaling](#scaling)
10. [Full architecture](#arch)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Limit requests per key — **per user / API-key / IP** — to **N requests per time window**.
2. Reject requests over the limit with a clear signal the client can act on.
3. *(Optional)* different limits per **tier** (free: 100/min, pro: 1000/min, enterprise: 10,000/min).

**Non-functional:**
- **Must not become the bottleneck it's meant to prevent** — the limiter sits in front of *every* request, so it has to be faster than the thing it's protecting.
- **Low added latency** — a check that costs more than ~1-2ms defeats the purpose.
- **Works correctly across a fleet of stateless app servers** — the limit must hold *globally*, not per-node.
- **High availability** — if the limiter falls over, it shouldn't take the whole API down with it.

> This is the mirror image of Problem 01: **write-heavy** (a counter touch on *every single request*, not just on creation), and the "hot path" is a check-and-increment, not a lookup.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume **500,000 req/s** across the fleet (a large API — think a payments gateway or a major SaaS).

**App servers:** if each handles ~10K req/s → **~50 stateless app servers** behind the LB.

**Redis ops this implies:**
- Sliding-window-counter approach → 1 `INCR` + (occasionally) 1 `EXPIRE` per request, or both folded into **one Lua script call** → **~1 Redis round-trip per request**.
- Sorted-set (sliding-window-log) approach → `ZADD` + `ZREMRANGEBYSCORE` + `ZCARD` + `EXPIRE` per request → **~3-4 Redis ops per request**.

```
Counter approach:  500K req/s × 1 op   ≈  500K Redis ops/sec
Sorted-set approach: 500K req/s × ~4 ops ≈ 2M Redis ops/sec
```

A single Redis node realistically sustains **~100K-150K ops/sec** under real-world (networked, not micro-benchmark) conditions. So:
- Counter approach → needs **~4-5 Redis shards**.
- Sorted-set approach → needs **~15-20 Redis shards**.

> This number alone is the argument for picking the **cheap counter algorithm** over the accurate-but-heavy sorted-set log — see Part 4. At 500K req/s, 4x the Redis ops per request means 4x the cluster.

**Latency budget:** Redis round-trip ~0.5-1ms (same datacenter). That has to be added to every request's critical path — small, but not free.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

The limiter isn't a public endpoint — it's **middleware** that runs before the request reaches business logic (at the gateway or in-app, see [§8](#lb)):

```
[Incoming Request]
      │
      ▼
[Rate-Limit Middleware]
   check key = f(userId | apiKey | ip)
      │
      ├── under limit → allow → forward to app logic
      │
      └── over limit  → 429 Too Many Requests
                          Retry-After: 30
                          X-RateLimit-Limit: 100
                          X-RateLimit-Remaining: 0
                          X-RateLimit-Reset: 1690000060
```

- **`429 Too Many Requests`** — the standard status for "you're over the cap."
- **`Retry-After`** — seconds until the client should retry; good API citizenship.
- **`X-RateLimit-*`** headers — let well-behaved clients self-throttle *before* hitting 429 at all.
- Rejection must be **cheap** — headers + status code only, no DB call, no business logic touched. If a 429 costs real work, the limiter *is* the DoS vector.

---

<a name="core"></a>
# 4. Core: the counting algorithm 🎯

The signature challenge of this problem: **how do you count "requests in the last N seconds" cheaply and correctly, when checks happen from many nodes at once?**

| Algorithm | State per key | Bursts | Accuracy | Verdict |
|---|---|---|---|---|
| Fixed window | 1 counter | — | low (2× at boundary) | too leaky |
| Sliding window log | 1 timestamp/request | — | exact | too much memory at scale |
| **Sliding window counter** ⭐ | 2 counters | — | near-exact | **pick this** |
| Token bucket | count + timestamp | ✅ | avg | great alternative, less "hard cap" |
| Leaky bucket | queue | ❌ | smooth output | wrong shape (we reject, don't queue) |

## Why sliding window counter wins here
- **Fixed window** is one `INCR` — dead simple — but a client can send the full limit at `:59` and again at `:00` and get **2× the limit** in under a second. Not acceptable for an abuse-prevention primitive.
- **Sliding window log** (a Redis sorted set, one entry per request) is perfectly accurate but at 500K req/s that's **millions of ZSET entries live at once** — memory and ops cost explodes (see estimation above).
- **Sliding window counter** keeps just **two integers per key** (current window + previous window) and *weights* the previous window's count by how much of it still overlaps — near-log accuracy, counter-level cost. This is what Cloudflare and most production limiters actually run.

## The algorithm
```
Window = 60s, limit = 100.  Now = 30% into the current minute.
prev_count = 80 (last minute's total)   curr_count = 20 (this minute so far)

estimate = curr_count + prev_count × (1 − elapsed_fraction)
         = 20 + 80 × 0.7
         = 76   → under 100 → ALLOW, curr_count++
```

## Implementation A — two counters, real Redis commands
```
key_prev = "rl:{user42}:2026081014"    # previous minute bucket
key_curr = "rl:{user42}:2026081015"    # current minute bucket

MULTI
  INCR key_curr
  EXPIRE key_curr 120        -- outlives 2 windows, so "prev" is still readable
EXEC

prev = GET key_prev  (or 0 if missing)
curr = the INCR result above
estimate = curr + prev * (1 - elapsed_fraction_of_current_window)
if estimate > limit: reject (429)   else: allow
```
`INCR` is atomic in Redis by design — two servers hitting it concurrently still get a correct, serialized count.

## Implementation B — sorted-set sliding-window-log (exact accuracy, for low-QPS keys like login attempts)
```
ZADD rl:login:ip1.2.3.4 <now_ms> <now_ms>-<random>          -- record this request
ZREMRANGEBYSCORE rl:login:ip1.2.3.4 -inf (now_ms - 60000)   -- drop anything older than window
ZCARD rl:login:ip1.2.3.4                                     -- count what's left
EXPIRE rl:login:ip1.2.3.4 60
if ZCARD result > limit: reject
```
Wrap in a **Lua script (`EVAL`)** so all four commands run as one atomic unit — otherwise two concurrent requests can both read the count before either writes, both get allowed (the race in [§5](#distributed)).

> **Interview move:** default = sliding window counter (cheap, near-exact, scales). Sorted-set log is the "perfect accuracy on a low-volume key" upgrade — 5 login attempts/min doesn't generate enough ZSET entries to matter.

---

<a name="distributed"></a>
# 5. The distributed-counter problem

## Why a per-node in-memory counter is wrong
50 stateless app servers, each keeping `count` in a local variable. A user's requests get load-balanced round-robin across all 50.
```
Limit "100/min per user" but each server counts independently:
Server1: allows up to 100   Server2: allows up to 100   ...   Server50: allows up to 100
→ user can actually make ~5,000 requests/min before every server independently caps them. ❌
```
The limit is effectively **(server count) × too loose** — exactly the trap Part 23 calls out. In-memory state on a stateless fleet simply isn't shared.

## The fix: centralize in Redis
All 50 servers `INCR` the **same key** (`rl:user42:<window>`) in the **same Redis instance/cluster** — one true count regardless of which server the request lands on.

**Why `INCR` fixes the race:** a naive "read count → compare → write count+1" in application code is **not atomic** — two servers can both read `99`, both decide "under 100, allow," and both write `100`, silently letting through request #101. Redis's `INCR` does the read-modify-write as a **single atomic server-side operation** — Redis is single-threaded for command execution, so there's no window for two increments to interleave. Same atomicity guarantee as Part 5.5's counters, applied to enforcement instead of measurement.

## What if Redis itself is briefly unavailable?
Now Redis is a **dependency of the hot path** — a ~1ms round-trip on every request, and a potential single point of failure. Two policies, a deliberate trade-off:

| Policy | Behavior when Redis is down | Favors | Use for |
|---|---|---|---|
| **Fail-open** | Allow all traffic through, unchecked | Availability | General APIs — a few unlimited minutes beats an outage |
| **Fail-closed** | Block all traffic | Protection | Security-critical paths — login, OTP, payments |

Mitigate the SPOF itself with a Redis **replica + cluster** (Part 21) rather than a single node — see [§9](#scaling).

---

<a name="db"></a>
# 6. Database *(Part 8)*

The limiter's *hot* state (live counters) never touches a disk-backed DB — that's entirely Redis. What *does* belong in a database is the **per-tier configuration** — rarely written, occasionally read:

```
tier(PK)    | requestsPerWindow | windowSeconds | burstAllowance
"free"      | 100               | 60            | 0
"pro"       | 1000              | 60            | 200
"enterprise"| 10000             | 60            | 2000
```

- Simple **key-value** — no joins, no relationships → any KV store or a tiny Postgres table works.
- **Read-mostly, write-rarely** (an admin changes tier limits maybe once a month) → this is exactly the shape that tolerates aggressive caching (see [§7](#cache)) or even loading fully into app-server memory on startup.
- Per-*user* current tier lives in the existing user/account table — the limiter just looks it up to decide which config row applies.

---

<a name="cache"></a>
# 7. Caching / Redis *(Parts 5, 5.5)*

Unlike Problem 01, where Redis sits *in front of* the database as a cache, here **Redis IS the core data store** — there's no "miss → fall through to Postgres" for the counters, because there's nothing to fall through to. Redis has three distinct jobs:

1. **Atomic counter** — `INCR` on `rl:{key}:{window}` is the whole enforcement mechanism (§4, §5). This is the job that must never be slow or racy.
2. **TTL-based window expiry** — `EXPIRE` makes windows self-cleaning. No cron job sweeps old counters; a key for a window that's over simply vanishes, and the next request creates a fresh one. This is the same TTL superpower Part 5.5 uses for sessions and OTPs, repurposed for windows.
3. **Storing per-tier limit configs** — the config table from §6, cached (or fully loaded) in Redis as a **hash** (`HGETALL tier:pro`) so the "what's this user's limit?" lookup costs microseconds, not a DB round-trip, on every single request.

```
GET  tier:pro                       → {"limit":1000,"window":60}   (config, rarely changes)
INCR rl:user42:2026081015           → 47                            (live counter, changes constantly)
EXPIRE rl:user42:2026081015 120     → self-cleaning
```

> Same pattern as Part 5.5's "structure + TTL" mantra — here the structure is a plain integer counter, and TTL is what makes the *sliding* part of "sliding window" work without any cleanup process.

---

<a name="lb"></a>
# 8. Load Balancer *(Part 2.5, 2.6)*

**Where the check sits matters as much as the algorithm:**

```
Client → [API Gateway / Reverse Proxy] → [Load Balancer] → [App Servers ×50] → [DB]
              ▲ rate-limit HERE (ideal)                          ▲ or here (fallback)
```

- **At the edge (API gateway / reverse proxy — Kong, Nginx, Cloudflare, AWS API Gateway):** best. Abusive traffic is rejected **before** it consumes a load-balancer slot, an app-server thread, or a DB connection.
- **Per-service / in-app:** more flexible for business-specific rules (e.g. "this *endpoint* has a tighter limit than that one"), but the request has already paid the cost of reaching the app server.
- **Real systems layer both:** a blunt IP-based limit at the edge (cheap, stops floods early) + a precise per-user/per-endpoint limit in-app (`POST /login` tighter than `GET /products`).

---

<a name="scaling"></a>
# 9. Scaling *(Parts 2, 21)*

The limiter protecting the fleet must itself scale *with* the fleet — a single-node Redis maxing at ~100-150K ops/sec can't absorb 500K req/s (§2).

## Redis Cluster — shard by the rate-limit key
```
hash(user42) → slot 7451 → Shard 2
hash(user99) → slot 12002 → Shard 5
```
- Each user/API-key/IP's counter lives on exactly **one shard** — no cross-shard coordination needed per check, since a single request only ever touches its own key.
- Same shard-key principle as Problem 01's machine-ID prefix: **pick a key that spreads load evenly and keeps each unit of work on one node.** Redis Cluster handles the hashing (16,384 hash slots) and rebalancing as shards are added.

## Replicas for the config lookups
The per-tier config (§6) is read on every request but written almost never — a textbook case for **read replicas** (Part 21). Point app servers at replicas for `GET tier:*`; only the rare config update goes to the primary. Live counters, by contrast, **must** go to the primary (or cluster shard) directly — replicating a counter introduces lag that lets requests slip through during the gap.

## Order of scaling moves
```
Redis Cluster (shard counters by key) → replicas (config reads) → more app servers (stateless, trivial) → edge rejection (§8, cuts load before it reaches Redis at all)
```

---

<a name="arch"></a>
# 10. Full architecture

```
[Clients]
   │
[API Gateway / Reverse Proxy]         ← rate-limit middleware runs HERE first (Part 2.6)
   │  429 short-circuits here, never goes further ↓
   │
[Load Balancer]                       ← spreads allowed traffic (Part 2.5)
   │
[Stateless App Servers ×50]           ← per-endpoint fine-grained limits, no local counters (Part 2)
   │
   ├──► [Redis Cluster: counters]     ← INCR/EXPIRE, sharded by key (Part 5.5, 21)
   │        atomic check-and-increment, sliding window counter
   │
   ├──► [Redis: tier configs]         ← HGETALL, served from replicas (Part 21)
   │
   ▼ (only requests that passed the check)
[Business logic / DB]                 ← never sees rejected traffic

Config source of truth: [Postgres/KV: tier limits table] → loaded into Redis on change (Part 8)
```

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How would you design a rate limiter for a large API?"
> *"I'd put the check as early as possible — at the API gateway — so abusive traffic never reaches app servers or the database. Each request is checked against a per-key counter, where the key is usually user ID or API key, sometimes IP for anonymous traffic. The counter has to live in a shared store, not app-server memory, because the fleet is stateless and load-balanced across many nodes."*

### Q: "Which counting algorithm would you pick, and why?"
> *"Sliding window counter. Fixed window is simplest but allows up to 2x the limit at a window boundary. A sliding window log is perfectly accurate but stores a timestamp per request, which gets expensive fast at high QPS. The sliding window counter is a middle ground — just two integers per key, current and previous window — that estimates the rolling count by weighting the previous window's count by how much still overlaps. Near-exact accuracy for counter-level cost, which is what most production systems, like Cloudflare, actually run."*

### Q: "Why can't each app server just keep its own counter?"
> *"Because the fleet is stateless and load-balanced — a user's requests land on different servers request to request. If each server counts independently, a limit of 100/minute becomes effectively 100 times the server count, since each server enforces its own local 100. The counter has to be centralized somewhere every server can see, which is almost always Redis."*

### Q: "Isn't there a race condition when many servers hit the same Redis counter?"
> *"There would be if I did it as separate read-then-write steps — two servers could both read 99, both decide to allow, and the count overshoots. I avoid that by using Redis's INCR, which is atomic — the read-modify-write happens as one indivisible operation on the Redis server, so concurrent increments always serialize correctly. For the sorted-set version I wrap the multiple steps in a Lua script so they run as a single atomic unit for the same reason."*

### Q: "What happens if Redis goes down?"
> *"That's a real trade-off, since Redis is now on the hot path for every request. I'd run it as a cluster with replicas to reduce how often that happens, and then pick a failure policy deliberately: fail-open, which lets all traffic through and favors availability — the right call for a general API, since an unprotected few minutes beats a full outage. Or fail-closed, which blocks everything and favors protection — the right call for something security-critical like login, where letting unlimited attempts through is worse than a temporary outage."*

### Q: "How does this itself scale to very high request rates?"
> *"Shard the Redis layer by the rate-limit key — user ID, API key, or IP — so each key's counter lives on exactly one shard and every check is a single-shard operation with no cross-shard coordination. The per-tier limit configuration is read far more than it's written, so I'd serve those lookups from Redis replicas. And the cheapest scaling move is pushing the check to the edge, so rejected requests never even reach the app servers or Redis cluster that's doing the counting."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

- **Shape:** write-heavy — a counter touch on *every* request, not just on creation.
- **Requirements:** limit per user/API-key/IP to N/window; must not itself become the bottleneck; low latency; works across a stateless fleet.
- **Estimate:** 500K req/s fleet-wide → ~500K Redis ops/sec (counter approach) → needs a multi-shard Redis cluster; sorted-set log approach is ~4x the ops, ~4x the cluster.
- **API:** middleware in the request path; over limit → `429` + `Retry-After` + `X-RateLimit-*` headers; rejection must be cheap (no DB work).
- **Core algorithm:** sliding window counter ⭐ — 2 counters/key, near-exact, cheap. Fixed window = boundary burst (2x limit). Sliding log = exact but memory-heavy. Token bucket = good alternative for bursty traffic.
- **Distributed problem:** per-node in-memory counters → limit × server-count (too loose). Fix: centralize in Redis, atomic `INCR` (or Lua script) prevents the read-check-increment race.
- **Redis down:** fail-open (availability, general APIs) vs fail-closed (protection, login/security paths).
- **DB:** simple KV table for per-tier limit config (rare writes, cacheable).
- **Redis's 3 jobs here:** atomic counter, TTL-based self-cleaning windows, cached tier configs — Redis *is* the store, not just a cache in front of one.
- **LB/Gateway:** check at the edge — reject before app servers/DB are touched.
- **Scaling:** Redis Cluster sharded by rate-limit key + replicas for config reads + edge rejection to cut load before it reaches Redis at all.

*— Design Problem 02 complete —*
