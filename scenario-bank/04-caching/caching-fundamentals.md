# Caching Fundamentals — Scenario Bank

> Redis-specific internals already live in [`System-design/05-caching.md`](../../System-design/05-caching.md) and [`System-design/05.5-redis-deep-dive.md`](../../System-design/05.5-redis-deep-dive.md). These entries focus on the reasoning/trade-off angle.

---

### "Why use caching? Where would you place a cache?"

A cache exists to avoid redoing expensive work you already did recently — a database query, a computation, a call to a slow external API — by keeping the answer somewhere fast to fetch from instead. It trades a small amount of storage and a new problem (staleness) for a large amount of speed and reduced load on whatever's behind it.

Where you place one depends on *what* you're trying to avoid re-doing, and each layer solves a different problem:
- **Client cache** (browser) — avoids a network round-trip entirely for static assets or recently-fetched data.
- **CDN** — avoids hitting your origin server at all for content that's the same for every user (images, JS bundles, public pages), serving it from a location physically close to the user.
- **Application cache** (in-memory, or Redis/Memcached) — avoids recomputing or re-fetching something expensive on the server side, shared across requests/instances.
- **Database cache** — the database's own internal caching of recently-read pages in memory, mostly out of your direct control but worth knowing exists.

**Interview line:** *"Caching trades a bit of storage and a staleness problem for avoiding expensive repeated work — a query, a computation, a slow API call. Where I place it depends on what I'm avoiding: a CDN if it's the same for every user and I want to avoid hitting my origin at all, an application cache if it's server-side computation or a database query I don't want to redo on every request."*

**Tests:** caching fundamentals, cache placement

*Axis: performance · Source: challenge question*

---

### "Client cache vs CDN vs application cache vs database cache?"

| Layer | Lives | Caches | Avoids |
|---|---|---|---|
| Client (browser) | User's device | Static assets, API responses (`Cache-Control`) | A network round-trip entirely |
| CDN | Edge locations, geographically close to users | Static/public content, sometimes full pages | A trip all the way to your origin server |
| Application cache | Your server / Redis | Query results, computed values, session data | Recomputation or a repeated database hit |
| Database cache | Inside the database engine | Recently-read data pages, in memory | A disk read |

They compose, not compete — a well-built system uses several layers at once, each catching what the layer before it missed. A request for a product page might hit: browser cache (miss, first visit) → CDN (hit, if it's cacheable) → app server → Redis (hit, if this product was recently viewed by anyone) → database (only on a cold cache).

**Interview line:** *"These aren't competing choices, they stack — client cache avoids the network trip entirely, a CDN avoids hitting my origin, an application cache avoids recomputing or re-querying, and the database's own cache avoids a disk read as the last line. A real system uses all of them, each catching what the one before it missed."*

**Tests:** caching layers, system design

*Axis: performance · Source: challenge question*

---

### "Cache-aside vs write-through vs write-behind?"

Three different rules for keeping a cache and the database in sync:

**Cache-aside (lazy loading)** — the application checks the cache first; on a miss, it reads from the database and *then* writes the result into the cache for next time. Writes go straight to the database, and the cache entry is either invalidated or updated separately. Simple, and the most common default — but every cache miss pays the full database-read latency, and there's a window where cache and database can disagree.

```js
async function getUser(id) {
  let user = await cache.get(`user:${id}`);
  if (!user) {
    user = await db.users.findById(id);
    await cache.set(`user:${id}`, user, { ttl: 60 });
  }
  return user;
}
```

**Write-through** — every write goes to the cache *and* the database together, synchronously, as part of the same operation. The cache is never stale relative to the database (assuming the write succeeds in both), but every write now pays the latency of writing to both.

**Write-behind (write-back)** — a write goes to the cache immediately (fast), and the database write happens asynchronously afterward. Fastest writes, but there's a real risk window: if the process crashes before the async database write completes, that write is lost.

**Interview line:** *"Cache-aside is the common default — read from cache, fall back to the database on a miss, populate the cache after. Write-through keeps the cache always in sync with the database at the cost of slower writes. Write-behind is the fastest for writes but risks losing data if the process crashes before the async database write actually happens — I'd only use that where losing a very recent write is genuinely tolerable."*

**Tests:** caching strategies, consistency vs speed trade-offs

*Axis: performance · Source: challenge question*

---

### "How do you decide TTL?"

TTL (time-to-live) is how long a cached value is trusted before it's considered stale and either refetched or discarded. It's a direct trade-off between **freshness** and **load reduction**:

- **Short TTL** — data stays close to current, but you get more cache misses, which means more load on whatever's behind the cache (database, API).
- **Long TTL** — fewer misses, less load, but data can be visibly stale for longer.

The actual decision should be based on **how often the underlying data changes** and **how bad it is if a user sees a stale value**:
- Rarely-changing data (a product category list) → long TTL, hours or more.
- Frequently-changing, low-stakes data (a "like count") → short TTL is fine, staleness is harmless.
- Frequently-changing, high-stakes data (account balance, inventory count deciding whether to sell) → often shouldn't be cached at all, or needs active invalidation on write rather than relying on a TTL to eventually expire it.

**Interview line:** *"TTL is a trade-off between freshness and load — shorter means fresher but more load on whatever's behind the cache, longer means less load but staler data. I set it based on how often the underlying data actually changes and how bad a stale read would be — rarely-changing, low-stakes data gets a long TTL; anything high-stakes I'd actively invalidate on write rather than just wait out a TTL."*

**Tests:** TTL trade-offs, staleness tolerance

*Axis: performance · Source: challenge question*

---

### "How do you cache user-specific data safely?"

The risk unique to caching per-user data is **cross-user leakage** — accidentally serving User A's cached data to User B, which is a much worse bug than ordinary staleness. This usually happens from a cache key that isn't actually unique per-user, or from a shared cache layer (like a CDN or reverse proxy) caching a response that varies by user without knowing it varies.

- **Always scope the cache key by user/tenant**: `user:123:profile`, never just `profile` — a global key shared across all users is the classic way this bug gets introduced.
- **Never let a CDN or shared HTTP cache cache a personalized response** without explicit `Cache-Control: private` (or `no-store`) — a public/shared cache in front of the app is the most common place this goes wrong, because it's caching at a layer that doesn't know the response is per-user.
- If using application-level caching (Redis), it's naturally safe as long as the key includes the user ID — the danger is almost entirely at the shared-cache-layer level, not the app-cache level, since Redis keys are explicit.

**Interview line:** *"The specific risk with user-specific caching is cross-user leakage, not just staleness — serving one user's cached data to another. I always scope the key by user ID so there's no shared global key, and for anything behind a CDN or shared HTTP cache, I mark personalized responses Cache-Control: private so a shared layer never caches one user's response and serves it to someone else."*

**Tests:** cache key design, cross-user data leakage

*Axis: failure · Source: challenge question*

---

### "How do you invalidate cache after a database update?"

The write itself should trigger the cache to stop serving the old value — otherwise you're relying entirely on the TTL to eventually expire it, which means users can see stale data for the whole TTL window after every single write.

Two common approaches, often combined:
- **Explicit invalidation on write** — the same code path that updates the database also deletes (or updates) the corresponding cache key, right there in the same transaction/operation. Simplest and most direct.
```js
await db.users.update(id, { name: 'New Name' });
await cache.del(`user:${id}`); // next read repopulates from the fresh DB value
```
- **Event-driven invalidation** — the write publishes an event, and something else (a consumer, a CDC pipeline reading the database's change log) reacts by invalidating the relevant cache keys. More moving parts, but necessary when the write and the cache aren't in the same codebase/service, or when many different cache keys derived from the same data need to be invalidated together.

The failure mode worth naming: **update-then-invalidate ordering matters under concurrency** — if a read races in between the database update and the cache invalidation, it can populate the cache with the stale value right after it was invalidated, "reviving" stale data. A short TTL as a backstop limits how long that particular race can matter.

**Interview line:** *"I invalidate the cache key explicitly in the same operation as the database write, rather than relying purely on TTL expiry. Where the write and the cache aren't in the same service, I'd use event-driven invalidation instead. Either way I keep a reasonably short TTL as a backstop, because a read racing in right between the update and the invalidation can theoretically repopulate the cache with the stale value."*

**Tests:** cache invalidation strategies, race conditions

*Axis: consistency · Source: challenge question*

---
