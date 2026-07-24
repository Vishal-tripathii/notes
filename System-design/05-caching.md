# System Design Study Notes — Part 5

## Caching

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, real examples (Instagram, Flipkart), and interview Q&A included.
>
> **Continues from:** Parts 1–4. Caching is the biggest lever for the **latency** goal (Part 3), uses **Redis/CDN** (Parts 2–3), and its stale-data trade-off is a **consistency/CAP** choice (Part 4).

---

## Table of Contents

1. [Core idea + analogy](#core)
2. [The mechanism: cache hit & miss](#mechanism)
3. [Caching lives at every layer](#layers)
4. [Caching strategies (patterns)](#patterns)
5. [Eviction policies](#eviction)
6. [When to use / not use caching](#when)
7. [Trade-offs](#tradeoffs)
8. [Classic caching problems](#problems)
9. [Real-life examples (Instagram, Flipkart)](#examples)
10. [Interview questions & answers](#interview)
11. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="core"></a>
# 1. Core idea + analogy

**A cache is a small, fast store that keeps a copy of frequently-needed data close by, so you don't fetch/compute it from the slow source every time.**

The source of truth (database or expensive computation) is **slow**; the cache (usually in-memory, like Redis) is **fast**. Answer most requests from the cache → avoid the slow source most of the time.

```
WITHOUT cache:  [App] ──▶ [Database]   every request hits the slow DB (~50ms)
WITH cache:     [App] ──▶ [Cache] ✅ most requests answered here (~1ms)
                          ↓ only on miss
                        [Database]
```

## Analogy: your kitchen counter 🍶
The **pantry** (database) stores everything but is far away. The **counter** (cache) is right next to you but small. You keep **salt and pepper on the counter** because you use them constantly — instant to grab. You can't fit everything on the counter, so only the **frequently-used** items live there. That's caching: keep the hot stuff close and fast.

---

<a name="mechanism"></a>
# 2. The mechanism: cache hit & miss

- **Cache hit** ✅ — data is in the cache → return instantly (fast).
- **Cache miss** ❌ — not in cache → go to the slow source, get it, (usually) store it in cache, then return.

```
Request ──▶ Is it in the cache?
              │                  │
            HIT ✅             MISS ❌
              │                  │
        return from cache   fetch from DB ──▶ store in cache ──▶ return
         (fast, ~1ms)              (slow this once, ~50ms)
```

**Hit ratio** (hits ÷ total lookups) is the key metric. 95% hit ratio = 95% of requests never touch the slow DB. Higher hit ratio = faster system + less DB load.

---

<a name="layers"></a>
# 3. Caching lives at every layer

Data is cached at **many layers** between user and database; each layer catches requests so fewer reach the next:

```
[Browser cache] ─▶ [CDN] ─▶ [Load balancer] ─▶ [App / in-memory cache] ─▶ [Redis] ─▶ [DB query cache] ─▶ [Database]
   closest/fastest to user ──────────────────────────────────────────▶ slowest/source of truth
```

- **Browser cache** — browser stores images/CSS/JS locally; revisiting a page is instant.
- **CDN (Content Delivery Network)** — worldwide servers cache static content (images/video) near users. *(The CDN from Part 3 for cutting latency.)*
- **Application cache** — shared in-memory store (**Redis/Memcached**) holding hot data (Redis from Part 2).
- **Database cache** — the DB caches recent query results in memory.

> The closer to the user a request is answered, the faster it feels and the less load hits everything downstream.

---

<a name="patterns"></a>
# 4. Caching strategies (patterns)

## Read patterns

### 1. Cache-Aside (Lazy Loading) — most common
The **application** manages the cache. Read: check cache → on miss, load from DB, store in cache, return.
```
1. App checks cache
2. HIT → return it
3. MISS → read DB → write to cache → return it
```
- ✅ Only requested data is cached (memory-efficient); cache failure doesn't break reads (fall back to DB).
- ❌ First request for any item is always a miss (slow); can go stale if DB changes.
- **Used by:** most systems by default. Great for read-heavy workloads.

### 2. Read-Through
The **cache** sits in front of the DB and loads missing data automatically — the app only talks to the cache.
- ✅ Simpler app code. ❌ Needs cache provider support; still has first-miss penalty.

## Write patterns (where consistency lives)

### 3. Write-Through
Every write goes to **cache AND database together** (synchronously).
```
Write ──▶ [Cache] + [Database]  (both updated together)
```
- ✅ Cache **always fresh** — never stale. ❌ **Slower writes** (two writes); caches data that may never be read.

### 4. Write-Back (Write-Behind)
Write to **cache only**, flush to DB **later** (async, batched).
```
Write ──▶ [Cache] ✅ (return immediately) ┈┈later┈┈▶ [Database]
```
- ✅ Very **fast writes**, high throughput (the latency/throughput batching trade-off from Part 3!).
- ❌ **Risk of data loss** if cache crashes before flushing. Use where some loss is tolerable (analytics, counters, view counts).

### 5. Write-Around
Writes go **straight to the DB, bypassing the cache**; cache populated only on read misses.
- ✅ Avoids filling cache with write-heavy, rarely-read data. ❌ Recently-written data misses on first read.

### Comparison
| Pattern | Freshness | Write speed | Risk | Best for |
|---|---|---|---|---|
| **Cache-aside** | Can go stale | Normal | — | General read-heavy (default) |
| **Write-through** | Always fresh | Slower | — | Read-heavy, needs freshness |
| **Write-back** | Fresh in cache | Very fast | Data loss on crash | Write-heavy, loss-tolerant |
| **Write-around** | Fresh (from DB) | Normal | First-read miss | Write-heavy, rarely re-read |

---

<a name="eviction"></a>
# 5. Eviction policies

A cache has limited memory. When full and you add something new, you must **evict** something. The policy decides what:

- **LRU (Least Recently Used)** — evict item not accessed longest. **Most common** ("recently used = likely used again").
- **LFU (Least Frequently Used)** — evict item accessed *fewest* times. Good when popularity is stable.
- **FIFO (First In First Out)** — evict oldest inserted, regardless of use. Simple, rarely ideal.
- **TTL (Time To Live)** — each item expires after a set time (e.g. 60s). *(Part 2: Redis `SET ... EX 1800`.)* Often combined with others.

> **Most systems use LRU + TTL together:** items expire after a TTL, and if memory fills first, LRU evicts the coldest ones.

---

<a name="when"></a>
# 6. When to use / not use caching

## USE caching ✅ when data is:
1. **Read far more than written** (read-heavy) — compute/fetch once, serve many times.
2. **Expensive to produce** — slow query, complex computation, external API call.
3. **Accessed repeatedly** ("hot" data) — viral post, homepage.
4. **Tolerant of slight staleness** — a few seconds old is fine.

## DON'T cache ❌ when data is:
1. **Write-heavy / changes constantly** — you'd invalidate so often it adds overhead without benefit.
2. **Rarely accessed** — caching data nobody re-reads wastes memory.
3. **Must be perfectly fresh/accurate** — bank balance, live trading price (stale money = disaster; recall CAP).
4. **Unique per request** — nothing to reuse.

---

<a name="tradeoffs"></a>
# 7. Trade-offs

### 1. Stale data (the consistency trade-off)
The cache is a *copy*. When the source changes, the cache can be **out of date** until updated. This is **exactly** the consistency-vs-speed trade-off from CAP (Part 4) — accept eventual consistency for speed. Manage with TTLs + invalidation.

### 2. Cache invalidation — "one of the two hard problems in CS"
> *"There are only two hard things in computer science: cache invalidation and naming things."*

Knowing **when to remove/update** cached data is genuinely hard. Too late → stale data. Too eager → lose the benefit. Strategies:
- **TTL** — expire automatically (simple, stale within window).
- **Write-through** — update cache on every write (always fresh, slower writes).
- **Explicit invalidation** — delete/update the entry when underlying data changes.

### 3. Extra complexity & cost
Another moving part to run, monitor, keep highly available (Part 2: Redis becomes critical infrastructure). More memory = more money.

### 4. Cold start
A fresh/emptied cache has **0% hit ratio** — every request misses and hits the DB, which can overload it until the cache "warms up."

---

<a name="problems"></a>
# 8. Classic caching problems (great interview material)

- **Thundering herd / Cache stampede** — a popular key expires; thousands of requests miss at once and hammer the DB. *Fix:* locking (one request refills, others wait), or staggered/randomized TTLs.
- **Hot key** — one key (viral celebrity profile) gets so much traffic it overwhelms a single cache node. *Fix:* replicate the hot key across nodes.
- **Cache penetration** — requests for data that **doesn't exist** always miss and hit the DB. *Fix:* cache the "not found" result, or a Bloom filter.
- **Cache avalanche** — many keys expire simultaneously → mass misses → DB overload. *Fix:* jitter/randomize TTLs.

---

<a name="examples"></a>
# 9. Real-life examples

## Instagram 📸
- **Feed / timeline** — expensive to compute (gather + rank posts from everyone you follow). Instagram **caches the computed feed** so scrolling is instant.
- **Images/videos → CDN** — media cached on worldwide CDN servers; a photo loads from a machine near you (low latency, Part 3).
- **Counts (likes/followers)** — cached, updated with **eventual consistency** (write-back style); fine if briefly off. *(The AP choice from Part 4.)*
- **Hot content** — a viral post is a **hot key**, replicated across cache nodes so one node doesn't melt.

## Flipkart / Amazon (e-commerce) 🛒
Shows **what to cache and what NOT to**:
- **Product catalog (name, description, images)** — changes rarely, read millions of times → **heavily cached** (cache-aside + CDN for images). Perfect candidate.
- **Price** — cached, but **shorter TTL / careful invalidation** — a wrong price is a real problem. Invalidated immediately on change (explicit invalidation).
- **Inventory / stock count** — **tricky.** Cache "in stock" loosely for browsing, but the **final "place order" step must check the real database** — you can't sell 1,000 units of 5 in stock. Browsing uses cache (fast); checkout uses source of truth (correct).
- **Big sale (Big Billion Days)** — massive read traffic → aggressive caching + CDN; **cache warming** beforehand (avoid cold start); jittered TTLs (avoid avalanche).

> **The pattern:** cache read-heavy, staleness-tolerant data (catalog, images, feed); be careful / don't cache must-be-exact data (balance, final inventory, payment).

---

<a name="interview"></a>
# 10. Interview questions & answers

### Q: "What is caching and why use it?"
> *"Caching is keeping a copy of frequently-accessed data in a fast store — usually in-memory like Redis — so you don't have to fetch it from the slow source, like a database, every time. It reduces latency because reads come from memory instead of disk, and it reduces load on the database because most requests are served from the cache. It's the single biggest lever for read-heavy systems."*

### Q: "Write-through vs write-back?"
> *"Write-through updates the cache and the database at the same time, synchronously — so the cache is always fresh, but writes are slower because you write twice. Write-back updates only the cache and flushes to the database later, asynchronously — so writes are very fast and high-throughput, but you risk losing data if the cache crashes before flushing. I'd use write-through when freshness matters, and write-back for counters or analytics where speed matters and a little loss is tolerable."*

### Q: "What is cache-aside / lazy loading?"
> *"Cache-aside means the application checks the cache first; on a miss, it reads from the database, stores the result in the cache, then returns it. It's the most common pattern because it only caches data that's actually requested and the system still works if the cache goes down — it just falls back to the database. The downsides are that the first request is always a miss, and the cache can go stale if the data changes."*

### Q: "How do you handle cache invalidation / stale data?"
> *"A few ways, depending on freshness needs. The simplest is a TTL, where entries expire automatically after a set time — easy, but data can be stale within that window. For stronger freshness I'd use write-through so the cache updates on every write, or explicit invalidation, where I delete or update the entry the moment the underlying data changes. It's a trade-off between freshness and complexity — invalidation is genuinely one of the hard problems."*

### Q: "What is a cache eviction policy? Name some."
> *"When the cache is full, the eviction policy decides what to remove. LRU — Least Recently Used — evicts whatever hasn't been touched longest, and it's the most common. LFU evicts the least frequently accessed. FIFO evicts the oldest inserted. And TTL expires items after a set time. Most systems combine LRU with TTL."*

### Q: "What is a cache stampede / thundering herd and how do you prevent it?"
> *"It's when a popular cached key expires and suddenly thousands of requests all miss at once and hammer the database together, which can overload it. You prevent it by letting only one request rebuild the cache while others wait — using a lock — or by jittering the TTLs so keys don't all expire at the same moment."*

### Q: "Would you cache a user's bank balance?"
> *"I'd be very cautious. A balance must be accurate — showing stale money is unacceptable — so I'd avoid caching it, or only cache with a very short TTL and always read from the source of truth for anything transactional. It ties back to CAP: for financial data I prioritize consistency over the speed a cache would give."*

### Q: "What would you cache in an e-commerce site, and what wouldn't you?"
> *"I'd heavily cache the product catalog and images — read millions of times, rarely changed — using an application cache and a CDN. I'd cache prices but invalidate them immediately on change. For inventory, I'd cache it loosely for browsing, but the final checkout must verify against the real database, because you can't oversell stock. The principle is: cache read-heavy data that tolerates slight staleness, but trust the source of truth for anything that must be exact."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet — everything on one page

### Core
- **Cache** = small fast store (Redis/CDN) holding a copy of hot data so reads skip the slow source.
- **Cache hit** = found in cache (fast). **Cache miss** = not found → hit source, store, return.
- **Hit ratio** = hits ÷ lookups. Higher = faster + less DB load.

### Layers (user → source)
Browser → CDN → App/in-memory (Redis/Memcached) → DB query cache → Database.

### Read patterns
- **Cache-aside (lazy loading)** — app checks cache, loads DB on miss. **Default.**
- **Read-through** — cache auto-loads on miss; app talks only to cache.

### Write patterns
| Pattern | Freshness | Write speed | Risk | Best for |
|---|---|---|---|---|
| Cache-aside | Can be stale | Normal | — | General read-heavy |
| Write-through | Always fresh | Slower | — | Needs freshness |
| Write-back | Fresh in cache | Very fast | Loss on crash | Write-heavy, loss-tolerant |
| Write-around | Fresh (DB) | Normal | First-read miss | Write-heavy, rarely re-read |

### Eviction policies
- **LRU** (Least Recently Used — most common), **LFU** (Least Frequently Used), **FIFO** (oldest in), **TTL** (time expiry). Usually **LRU + TTL** together.

### When to cache ✅
Read-heavy · expensive to produce · hot/repeatly accessed · tolerant of staleness.
### When NOT ❌
Write-heavy · rarely accessed · must be exact (balance, live price) · unique per request.

### Trade-offs
1. **Stale data** — a CAP/consistency choice (manage with TTL/invalidation).
2. **Invalidation** — a genuinely hard problem (TTL / write-through / explicit).
3. **Complexity + cost** — Redis becomes critical infra; memory costs.
4. **Cold start** — empty cache = 0% hits → can overload DB until warm.

### Classic problems + fixes
- **Thundering herd / stampede** — hot key expires, mass miss → lock refill / jitter TTL.
- **Hot key** — one key overloads a node → replicate the key.
- **Cache penetration** — missing data always misses → cache "not found" / Bloom filter.
- **Cache avalanche** — many keys expire together → jitter TTLs.

### Real examples
- **Instagram** — cache computed feed; CDN for media; counts eventual-consistent; viral post = hot key (replicated).
- **Flipkart/Amazon** — cache catalog + images heavily; price with short TTL + explicit invalidation; **inventory cached for browsing but verified at checkout**; big sale → cache warming + jittered TTLs.

### Connects to
- Part 2: Redis, replication, eventual consistency. · Part 3: latency (cache is the #1 lever), CDN, batching (= write-back). · Part 4: stale data = the CP/AP consistency choice.

### Golden rules
- Cache read-heavy, staleness-tolerant, expensive data.
- Never trust the cache for must-be-exact writes (verify source of truth at checkout/transfer).
- Freshness vs speed is the core trade-off; invalidation is the hard part.

### Suggested next topics
- **Message queues** (async processing, absorbing spikes, decoupling).
- **Capacity estimation** (back-of-envelope: users → RPS → storage).
- **Database types** (SQL vs NoSQL, indexing).

*— End of Part 5 —*
