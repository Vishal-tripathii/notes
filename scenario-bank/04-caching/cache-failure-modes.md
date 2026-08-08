# Cache Failure Modes — Scenario Bank

---

### "What is cache invalidation? Why is it difficult?"

Invalidation is telling the cache "the value you're holding is no longer correct, stop serving it" — usually because the underlying data changed. It sounds simple, but it's famously one of the two hard problems in computer science because of where it actually breaks down:

- **You have to find every place that data is cached** — if the same underlying data is cached under multiple keys, or in multiple layers (app cache, CDN, browser), missing even one means stale data keeps surfacing from wherever you forgot.
- **Timing races** — a write and an invalidation aren't automatically atomic together; a read can slip in between them and repopulate the cache with the stale value right after it was cleared (see the update-then-invalidate ordering issue in [`caching-fundamentals.md`](caching-fundamentals.md)).
- **Derived/aggregated data** — if a cached value is computed from multiple underlying records (a dashboard total, a search index entry), a change to *any one* of the contributing records should invalidate it, which means tracking dependencies, not just a single key.
- **Distributed caches** — invalidating a key on one cache node doesn't automatically invalidate copies on other nodes unless that's explicitly built (pub/sub invalidation, or just short TTLs as a safety net).

**Interview line:** *"Invalidation is hard because it's rarely just 'delete one key' — the same data can be cached in multiple places, a read can race in between the write and the invalidation and repopulate stale data, and derived values computed from several records need every contributing change to trigger invalidation, not just a direct one. That's why I always keep a TTL as a backstop even when I do explicit invalidation — it bounds how long any of those gaps can actually matter."*

**Tests:** invalidation difficulty, cache correctness

*Axis: consistency · Source: challenge question*

---

### "What happens when cached data becomes stale?"

The application keeps serving the old value, confidently, with no built-in signal that anything's wrong — that's what makes staleness dangerous: it fails silently, not loudly. Whether that's actually a problem is entirely context-dependent:

- **Harmless staleness** — a "like count" off by a few, a product description cached for an hour after a copy edit. No real consequence.
- **Real-bug staleness** — an inventory count that says "in stock" after the last unit sold, letting the site oversell; a permission/role cached after it was revoked, letting a now-unauthorized user keep acting on old access.

The response isn't "never let anything be stale" (that's just not caching at all) — it's identifying *which* cached values are dangerous when stale, and either shortening their TTL, invalidating them explicitly on write instead of relying on expiry, or not caching them at all if correctness genuinely can't tolerate any staleness window (e.g. checking a revoked permission — go straight to the source of truth for anything security-critical).

**Interview line:** *"Staleness fails silently, which is what makes it dangerous — the app just keeps confidently serving an old value. I don't treat all staleness the same: harmless staleness like a like-count is fine with a loose TTL, but anything where a stale read causes a real bug — inventory, permissions — I either invalidate explicitly on write or don't cache it at all and go straight to the source of truth."*

**Tests:** staleness risk assessment

*Axis: consistency · Source: challenge question*

---

### "How do you prevent cache stampede?"

A stampede: a popular cache key expires, and a large number of concurrent requests all miss the cache at the *same instant* — and all of them, independently, go hit the database to recompute the same value at the same time. The database, which was previously protected by the cache, suddenly gets hit with N simultaneous identical expensive queries instead of one — which can be enough load on its own to take the database down, right at the moment the cache was supposed to be protecting it.

Fixes:
- **Single-flight / request coalescing** — the first request past expiry acquires a lock (or a marker) and does the recompute; every other concurrent request for the *same* key waits for that one result instead of independently recomputing it, then all get served from the now-repopulated cache.
- **Stale-while-revalidate** — keep serving the (slightly) stale value to everyone while exactly one background request refreshes it — no one waits, no one stampedes the database, at the cost of briefly serving a stale value (usually an acceptable trade for a hot key).
- **Jittered TTLs** — instead of every replica of the same cached value expiring at exactly the same computed time, add a small random offset per entry, so expirations spread out over time instead of clustering at one instant.

**Interview line:** *"A stampede is a popular key expiring and every concurrent request missing at once, all hammering the database with the same recompute simultaneously. I'd use single-flight — only the first request recomputes, the rest wait on that result — or stale-while-revalidate, where everyone keeps getting the slightly-stale value while one background request refreshes it, so nobody stampedes the database at all."*

**Tests:** thundering herd, cache stampede prevention

*Axis: concurrency · Source: challenge question*

---

### "What is cache penetration? What is cache avalanche?"

**Cache penetration** — repeated requests for a key that **doesn't exist in the database at all**. Since it doesn't exist, it never gets cached (there's nothing to cache), so every single request for it skips the cache entirely and hits the database — every time, forever. This is exploitable: an attacker (or just a buggy client) hammering a nonexistent ID can bypass your cache's protection completely. Fix: cache the "not found" result too (a short-TTL negative cache entry), so repeated lookups of the same missing key stop reaching the database after the first one.

**Cache avalanche** — a large number of *different* cache keys all expire around the same time (commonly because they were all set with the same fixed TTL at the same time, e.g. after a cold cache warm-up or a deploy), causing a sudden mass simultaneous wave of database load as they all miss together — like a stampede, but across many different keys at once instead of one hot key. Fix: jittered/randomized TTLs (as in stampede prevention) so expirations spread out instead of clustering, plus keeping the cache layer itself highly available so it doesn't go from "fully populated" to "fully empty" all at once (e.g. avoid a full cache flush in production).

**Interview line:** *"Penetration is repeated lookups for something that doesn't exist in the database, so it never gets cached and every request hits the database — I fix that by caching the negative result too, with a short TTL. Avalanche is many different keys expiring at the same moment, usually from identical TTLs set at the same time, causing a mass simultaneous miss — I fix that with jittered TTLs so expirations spread out instead of clustering."*

**Tests:** cache attack/failure vectors, negative caching, TTL jitter

*Axis: failure · Source: challenge question*

---

### "What happens when Redis goes down? Should your application fail if the cache is unavailable?"

The honest default answer: **no, the application shouldn't fail just because the cache is unavailable** — a cache is, by definition, an optimization layer sitting in front of a source of truth (the database) that can answer the same questions, just slower. If Redis goes down and every request instead falls straight through to the database, that should be a *performance* degradation (slower, more load on the database), not a hard outage — assuming the database can actually absorb that load, which is the real risk (see below).

Design for that explicitly:
- **Fail open, not closed** — wrap cache reads/writes so a cache error is caught and treated as a miss, falling through to the real data source, rather than propagating as a request failure.
```js
async function getUser(id) {
  try {
    const cached = await cache.get(`user:${id}`);
    if (cached) return cached;
  } catch { /* cache down — fall through, don't fail the request */ }
  return db.users.findById(id);
}
```
- **The real danger is the database getting overwhelmed** the instant it loses its caching protection — this is the same shape as a cache avalanche, just triggered by the cache infrastructure dying instead of TTLs expiring. If the database genuinely can't survive 100% of traffic without the cache, that's worth knowing *before* it happens (load-test it), and mitigating with things like request queuing or a circuit breaker that starts shedding non-critical load rather than letting the database fall over entirely.
- The one exception: if the cache is being used for something that isn't just a performance optimization — e.g. a distributed lock, or rate-limiting state — losing it can be a correctness issue, not just a speed one, and that needs its own explicit failure handling, not a blanket "fail open."

**Interview line:** *"By default, a cache going down should degrade performance, not correctness — I fail open, catching cache errors and falling through to the database rather than failing the request. The real risk is whether the database can actually survive the full traffic load without the cache protecting it, which is worth load-testing ahead of time rather than discovering during the outage. The exception is if the cache is being used for something like a distributed lock, where losing it is a correctness problem, not just a speed one."*

**Tests:** cache as optimization vs dependency, fail-open design

*Axis: failure · Source: challenge question*

---
