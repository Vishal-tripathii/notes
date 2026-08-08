# Design Problem 15 — API Gateway (with rate limiting & auth)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 11, 15, 23. Signature challenge: handling cross-cutting concerns (auth, rate limiting, routing, request/response transformation) at the edge without becoming the single point of failure or the bottleneck.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design (gateway config API)](#api)
4. [Core: the request pipeline](#core)
5. [Database](#db)
6. [Caching](#cache)
7. [Load Balancer + HA](#lb)
8. [Scaling](#scaling)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Route incoming requests to the correct backend microservice based on path/host.
2. Authenticate the caller (validate token/API key) and authorize the action.
3. Rate limit callers to protect backend services from overload/abuse.
4. Log every request (for observability/audit).
5. *(Optional)* cache cacheable GET responses; transform request/response shape (e.g. strip internal headers, aggregate calls).

**Non-functional:**
- **Every single request in the system passes through this** — it sits on the hot path for *everything*, so it must add near-zero latency overhead.
- **High availability** — if the gateway is down, the entire API surface is down. **It cannot be a single point of failure.**
- **Horizontally scalable** — must handle the combined traffic of every backend service behind it.
- **Stateless** app-server instances so any instance can handle any request.

> This is a **write-once-config, read/enforce-on-every-request** system: the routing/auth/rate-limit *rules* are written rarely (an engineer registers a new route), but every one of millions of requests/day must be checked against those rules with minimal added latency. That asymmetry drives almost every design decision below — the config is small and cacheable; the enforcement path must be fast.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume the gateway fronts services doing **50,000 requests/sec** at peak (this is basically "however much total API traffic the company has" — the gateway must absorb all of it).

- **Throughput:** 50K req/s sustained, design for 2-3× burst (150K req/s) — traffic spikes hit the edge first.
- **Latency budget:** if a backend call normally takes 50ms, the gateway (auth check + rate-limit check + routing) should add **single-digit milliseconds**, not tens — it's pure overhead from the caller's point of view.
- **Config size:** number of routes/services is small — maybe hundreds to low thousands of route rules, and a similar order of API keys/tenants. This is tiny compared to request volume → **the whole routing+auth config comfortably fits in memory on every gateway instance.**
- **Rate-limit state:** one counter per API key per time window. At, say, 100K active API keys, that's a small, fast-changing dataset — a natural fit for Redis, not a durable DB.

**Takeaway:** unlike problem-01/03, storage isn't the hard part here (config is tiny) — **request-path latency under massive fan-in traffic** is.

---

<a name="api"></a>
# 3. API Design (the gateway's own config API) *(Part 11)*

The gateway itself proxies arbitrary backend APIs, but it also exposes a small **admin/config API** for registering what to route and how to protect it:

```
POST /admin/routes
Body: { "pathPrefix": "/orders/*", "backendUrl": "http://order-service:8080",
        "authRequired": true, "rateLimit": { "requests": 100, "windowSec": 60 },
        "cacheable": false }
→ 201 { "routeId": "..." }

GET /admin/routes            → list registered routes
DELETE /admin/routes/{id}    → remove a route

POST /admin/api-keys
Body: { "clientName": "mobile-app", "scopes": ["orders:read"] }
→ 201 { "apiKey": "..." }
```

Actual client traffic then just hits the gateway's public host directly — `GET api.company.com/orders/123` — and the gateway looks up which registered route matches, and applies that route's rules.

---

<a name="core"></a>
# 4. Core: the request pipeline 🎯

Every request runs through an **ordered middleware chain**. The order isn't arbitrary — each stage is designed to reject/short-circuit as cheaply and as early as possible, so bad requests are discarded before they cost anything expensive:

```
Request
   │
① Auth               → validate token/API key. Reject invalid/missing → 401.
   │
② Rate Limit          → is this (now-authenticated) caller under their quota? Reject → 429.
   │
③ Routing             → match path/host to a registered backend route. No match → 404.
   │
④ Request Transform   → strip internal headers, inject trace ID, adapt payload shape if needed.
   │
⑤ Forward to backend  → proxy the call, wait for response.
   │
⑥ Response Transform  → filter/reshape response, add CORS/security headers.
   │
⑦ Logging             → record request/response metadata (async, off the hot path).
   │
Response
```

### Why this exact order matters
- **Auth before rate limit:** an unauthenticated request shouldn't consume a legitimate tenant's rate-limit budget — if you rate-limited first, an attacker could burn through *someone else's* quota by spraying garbage credentials tagged with their API key, or worse, you'd be spending rate-limiter cycles (a shared, contended resource) on requests you're about to reject anyway for free. **Reject cheap failures first.**
- **Rate limit before routing:** don't bother resolving/calling a backend for a caller who's already over quota — routing + the backend call are the *expensive* steps (network hop, backend compute); a rejected-for-quota request should never reach them.
- **Routing before transform/forward:** you can't transform or forward a request until you know *where* it's going.
- **Logging last, and async:** logging is important but not on the critical path — do it after the response is ready to send (or fire-and-forget to a queue) so it never adds latency to the caller.

> **General principle:** order pipeline stages from **cheapest-to-reject / most-likely-to-short-circuit** → **most expensive**. This is the same idea as short-circuit evaluation in boolean logic, applied to a request pipeline.

---

<a name="db"></a>
# 5. Database

Two small, distinct stores — neither is on the hot request path in its raw form (see Caching, next):

| | **Route config** | **API-key / auth store** |
|---|---|---|
| Contents | `pathPrefix, backendUrl, authRequired, rateLimit, cacheable` | `apiKey/hash, ownerId, scopes, status (active/revoked)` |
| Size | Small (hundreds–thousands of rows) | Small–medium (thousands–millions of keys) |
| Store | Any SQL/NoSQL — low write volume, read-mostly | SQL/NoSQL; **store a hash of the key, never the raw key** (same principle as password storage) |
| Access pattern | Read by every gateway instance, changes rarely | Looked up on every request unless cached |

Because both are small and read-heavy-but-rarely-changing, they're prime candidates to be **held almost entirely in memory/cache** on each gateway instance rather than queried per-request (Section 6).

---

<a name="cache"></a>
# 6. Caching

Two different things get cached here, for two different reasons:

**1. Route config, in-memory on every gateway instance.** Since it's small and changes rarely, don't hit the DB per request at all — load it into memory at startup and **push updates** (via a pub/sub invalidation message or short-TTL periodic refresh) whenever an admin registers/changes a route. This keeps step ③ (Routing) essentially free.

**2. Auth-token validation, in Redis.** Validating a token often means calling out to an auth service (verify signature, check revocation, look up scopes) — doing that on *every single request* would make the auth service itself the bottleneck and add real latency. Instead:
```
Auth check → Redis? HIT ✅ (cached "valid, scopes=[...], expires=...") → proceed
           → MISS ❌ → call auth service → cache result (short TTL, e.g. 60s) → proceed
```
Short TTL trades a small revocation-detection delay for a big cut in load on the auth service — a reasonable trade-off for most APIs (and still bounded, unlike no caching at all).

**3. Response caching for cacheable GETs.** For routes marked `cacheable: true` (e.g. a read-only catalog endpoint), cache-aside the backend's response by `(route, query params)` in Redis with a TTL suited to that data's freshness needs — lets popular reads skip the backend entirely, same pattern as problem-01's redirect cache.

**4. Rate-limit counters, in Redis** (INCR + TTL per API key per window) — this *has* to be centralized and shared (not per-instance in-memory) because a caller's requests land on different gateway instances via the load balancer; only a shared store gives a globally-correct count.

---

<a name="lb"></a>
# 7. Load Balancer + HA *(Part 2.5)*

The gateway fronts everything — so **the gateway itself must never be a single point of failure**, or you've just moved the SPOF one hop earlier instead of eliminating it:

```
[Clients] → [Load Balancer, redundant] → [Gateway instances ×N, stateless] → [Backend services]
```

- **Stateless gateway instances:** no session/rate-limit state lives on any one instance (it's all in Redis) — any instance can serve any request, so instances can be added/removed/restarted freely, and the LB can route to whichever is healthy.
- **Redundant LB layer:** the load balancer itself is deployed in an HA pair/cluster (e.g. active-passive with a floating IP, or a managed LB service) — never a single box.
- **Health checks:** LB routes around unhealthy gateway instances automatically.
- **Deploy across availability zones:** gateway instances and the LB spread across zones so a single zone outage doesn't take down the whole API surface.

---

<a name="scaling"></a>
# 8. Scaling *(Parts 2, 21)*

Order of impact: **in-memory route config (removes a DB hit from the hot path) → horizontal stateless gateway instances → Redis for shared auth/rate-limit/response cache → async logging → scale/replicate the config & API-key stores.**

- **Horizontal scaling:** since gateway instances are stateless, scale out by just adding more behind the LB — this is the primary lever for the 50K→150K req/s burst case.
- **Redis itself needs to scale/be HA too:** it's now load-bearing for rate limiting and auth caching across every instance — run it replicated (and consider sharding rate-limit keys by API key if a single Redis becomes the bottleneck at very high key cardinality).
- **Async logging** (Part 13): push request/response logs to a queue → log-processing workers, so logging volume never adds latency to the request path.
- **Backend service isolation:** the gateway should apply timeouts/circuit-breakers per backend route, so one slow/failing backend can't exhaust gateway threads/connections and take down routing to *other* healthy backends.

---

<a name="arch"></a>
# 9. Full architecture

```
[Clients]
   │
[Load Balancer, redundant/multi-AZ]       ← HA entry point, no SPOF
   │
[Gateway Instances ×N, stateless]         ← scale horizontally
   │
   ├─① Auth           → Redis (cached token validation) → Auth Service (miss)
   ├─② Rate Limit      → Redis (INCR+TTL counters, shared across instances)
   ├─③ Routing         → in-memory route config (pushed/refreshed from Route DB)
   ├─④ Request Transform
   ├─⑤ Forward ────────────────────────────→ [Backend Services] (per-route timeout/circuit-breaker)
   ├─⑥ Response Transform  (+ Redis response cache for cacheable GETs)
   └─⑦ Logging (async) ───→ [Queue] → [Log workers]

Config stores: [Route Config DB]  [API-Key/Auth Store]   ← small, read-mostly, cached in-memory/Redis
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "Walk me through what happens to a request when it hits the gateway."
> *"It goes through an ordered pipeline: auth first — reject unauthenticated requests immediately with a 401. Then rate limiting — check the caller's quota in Redis, 429 if they're over. Then routing — match the path to a registered backend. Then any request transformation, forward to the backend, transform the response on the way back, and log asynchronously so logging never adds latency."*

### Q: "Why check auth before rate limiting, and not the other way round?"
> *"Because rate limiting is a shared, contended resource — you don't want to spend rate-limit budget or counter-update cost on requests you're going to reject anyway. It also stops an attacker from burning through a legitimate tenant's quota using garbage credentials. General rule: order the pipeline cheapest-reject first, most-expensive-operation last."*

### Q: "How do you make sure the gateway isn't itself a single point of failure?"
> *"Two things: the gateway instances are completely stateless — all auth cache, rate-limit counters, and route config are either in Redis or in-memory-refreshed, so any instance can handle any request — which means I can run many instances behind a load balancer and scale/replace them freely. And the load balancer in front of them is itself deployed redundantly, across availability zones, with health checks routing around dead instances. So there's no single box anywhere that being down takes the whole API surface with it."*

### Q: "The auth service call is slow — how do you avoid it becoming a bottleneck?"
> *"Cache the validation result in Redis with a short TTL — 60 seconds, say. Most requests then just hit Redis instead of the auth service, which is a huge reduction in load and latency. The trade-off is a short delay before a revoked token is actually rejected everywhere, which is acceptable for most APIs; if it isn't, you can push revocation events to actively invalidate the cache instead of waiting out the TTL."*

### Q: "Where does rate-limit state live, and why not just keep it in memory on each gateway instance?"
> *"It has to be a shared store like Redis, not per-instance memory — a single caller's requests get load-balanced across different gateway instances, so if each instance tracked its own counter, the caller could get roughly N× their real quota by spreading requests across N instances. Redis INCR with a TTL gives one globally-correct counter per API key per window."*

### Q: "How would you protect the gateway from one misbehaving backend service?"
> *"Per-route timeouts and circuit breakers. If one backend starts timing out, the circuit breaker trips and the gateway fails fast for that route instead of tying up threads/connections waiting on it — which protects routing to every other, healthy backend from being starved by the one bad one."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** cross-cutting edge layer sitting in front of every backend request; config is tiny/rare-write, enforcement is massive/every-request.
- **Estimate:** 50K req/s peak (design for 2-3× burst), single-digit-ms overhead budget, config fits in memory.
- **Core 🎯:** ordered pipeline — **auth → rate limit → routing → transform → forward → response transform → async log**. Cheapest-reject first, expensive steps last.
- **DB:** route config + API-key store — small, read-mostly, hash API keys, cached rather than queried per-request.
- **Cache:** in-memory route config; Redis for auth-token validation (short TTL), rate-limit counters (must be shared, not per-instance), and optional response caching for cacheable GETs.
- **LB + HA:** stateless gateway instances behind a redundant, multi-AZ load balancer — gateway must not become the new SPOF.
- **Scale:** horizontal stateless instances → replicated/sharded Redis → async logging → per-backend timeouts/circuit breakers to contain failures.

*— Design Problem 15 complete —*
