# Design Problem 01 — URL Shortener (bit.ly / TinyURL)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 1, 2, 2.5, 3, 5, 5.5, 8, 11, 13, 21.
>
> **Signature challenge:** generating a unique short code at scale. **Shape:** read-heavy key-value lookup.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: generating the short code](#core)
5. [Fixed length + collisions (the tricky bits)](#tricky)
6. [Database](#db)
7. [Caching (Redis)](#cache)
8. [Load Balancer](#lb)
9. [Scaling + Machine-ID prefix as shard key](#scaling)
10. [301 vs 302 redirect strategy](#redirect)
11. [Full architecture](#arch)
12. [Interview Q&A](#interview)
13. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Long URL → short URL (`short.ly/aB3xK9p`)
2. Short URL → redirect to original
3. *(Optional)* custom alias, expiration, analytics

**Non-functional:**
- **High availability** — redirects must never be down (dead links = broken product).
- **Low latency** — redirects near-instant.
- **Read-heavy** — ~**100:1** reads:writes (far more clicks than creations).
- **Scalable** — billions of URLs.
- Short codes ideally not easily guessable.

> Read-heavy + low-latency + HA → **caching and replication are central.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 100M new URLs/month, 100:1 read:write.
- **Writes/sec:** 100M ÷ (30×24×3600) ≈ **~40/s**
- **Reads/sec:** 40 × 100 ≈ **~4,000/s**
- **Storage:** 100M × 12 × 5yr ≈ **6B URLs** × ~500B ≈ **~3 TB**

**Short-code length (Base62 = a-z,A-Z,0-9 = 62 chars):**
- 62⁶ ≈ 56.8 **billion**
- 62⁷ ≈ 3.5 **trillion** ✅ → use **7 chars** (covers 6B with huge headroom).

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /api/shorten
Body: { "longUrl": "https://...", "customAlias": "optional" }
→ 201 { "shortUrl": "https://short.ly/aB3xK9p" }

GET /{shortCode}
→ 302 Redirect to the original long URL
```

---

<a name="core"></a>
# 4. Core: generating the short code 🎯

Turn a long URL into a unique 7-char code. Three approaches:

### A) Hash + take 7 chars
Hash the URL (MD5), Base62-encode, take first 7.
- ❌ **Collisions** (different URLs → same 7 chars) → must check DB + retry. Gets worse as DB fills.

### B) Counter + Base62 ✅ (clean favorite)
Global auto-increment counter → Base62-encode each number.
```
1 → "1"   ·   125 → "cb"   ·   1,000,000 → "4c92"
```
- ✅ **No collisions ever** (each number unique). Simple, fast.
- ❌ Sequential/predictable → start counter high or scramble.

### C) Key Generation Service (KGS)
Pre-generate billions of unique random 7-char keys offline; hand one out per request.
- ✅ No runtime collision checks, fast, unpredictable. Common at scale.

> **Base62 encoding = repeated ÷62; remainders map to chars.** The encoding step is identical for hash vs counter — the difference is *what number* you feed it (hash = collision risk; counter = unique by design).

### Distributed counter problem
One counter = bottleneck + SPOF. Fixes: **range-based** (each server grabs a number range), **Redis INCR** (atomic, Part 5.5), or Snowflake/Zookeeper.

---

<a name="tricky"></a>
# 5. Fixed length + collisions (the tricky bits)

## Keeping exactly 7 chars
- **Hash approach** → the number is huge → Base62 gives ~22 chars → **slice the first 7** (never too short).
- **Counter approach** → small numbers give short codes (`"4c92"`) → **pad to 7** (`"0004c92"`) OR **start the counter at 62⁶** so every code is naturally ≥7 chars.

## What a collision is
Two **different URLs** producing the **same** short code:
```
"google.com"   → "aB3xK9p"
"facebook.com" → "aB3xK9p"   ← collision! one code can only point to ONE url
```
Like two people assigned the **same locker**. Happens because you map **unlimited URLs → limited codes** and truncating a hash throws away bits (pigeonhole principle).

**Fix:** check the DB → if taken by a different URL, regenerate (salt + re-hash, or take next chars) → repeat until free. **A counter avoids this entirely** (each number is inherently unique).

---

<a name="db"></a>
# 6. Database *(Part 8)*

Essentially a **key-value lookup:** `shortCode → longUrl`.
```
shortCode(PK) | longUrl | createdAt | expiresAt | userId | clicks
```
- **NoSQL fits naturally** (DynamoDB/Cassandra) — simple key lookups, no joins, shards on shortCode. SQL fine at smaller scale (index shortCode).

---

<a name="cache"></a>
# 7. Caching (Redis) *(Parts 5, 5.5)*

Redirect is the hot path (~4,000/s, read-heavy). **Cache-aside:**
```
Redirect aB3xK9p → Redis? HIT ✅ return (~1ms) / MISS ❌ → DB → store in Redis → return
```
Viral links get most clicks → **very high hit ratio** → most redirects skip the DB.

**Redis's 3 jobs here:** ① cache redirects ② atomic counter (INCR) for code gen ③ rate limiting (INCR+TTL) on URL creation.

---

<a name="lb"></a>
# 8. Load Balancer *(Part 2.5)*

```
[Users] → [Load Balancer] → [App Server 1..N]
```
- Spreads read-heavy traffic across **stateless** app servers.
- **Health checks** → route around dead servers → HA (redirects never down).
- Enables horizontal scaling / auto-scaling on spikes.

---

<a name="scaling"></a>
# 9. Scaling + Machine-ID prefix as shard key *(Parts 2, 21)*

Order of impact: **cache → horizontal app servers → read replicas → sharding → async analytics → CDN.**
- **Replication** (Part 21): read replicas (read scale) + failover (HA). Primary = writes.
- **Sharding** (Part 21): split billions of URLs by shard key for storage + write throughput.

## ⭐ Machine-ID (prefix) as shard key — two problems, one move
**Problem:** many servers generating codes — avoid duplicates without coordinating every request.
**Solution:** give each machine a unique **prefix**; code = `[machine prefix] + [local counter Base62]`:
```
Machine 1: "1" + "aB3xK" → "1aB3xK"
Machine 2: "2" + "aB3xK" → "2aB3xK"   ← same local counter, different code!
```
- ✅ Codes **never collide** across machines — **zero coordination**.
- ⭐ **Bonus:** the prefix **is the shard key** → `"2aB3xK"` → prefix `2` → route lookup straight to Shard 2. (Like Twitter **Snowflake** embedding a machine ID.)

## Async analytics *(Part 13)*
Click events → **queue** → workers update counts → redirect stays fast (never block on analytics).

---

<a name="redirect"></a>
# 10. 301 vs 302 redirect strategy

| | **301 Permanent** | **302 Temporary** |
|---|---|---|
| Browser caches? | ✅ Yes | ❌ No |
| Future clicks | Skip your server | Hit your server every time |
| Analytics | ❌ Lost | ✅ Full |
| Server load | Lower | Higher |
| Change target? | Hard | Easy |

> **Use 302** (most shorteners do) → track clicks + change targets, accepting more load — which Redis caching makes cheap (~1ms/lookup). **Use 301** for max performance if analytics don't matter.

---

<a name="arch"></a>
# 11. Full architecture

```
[Users]
   │
[CDN]  (optional, hot redirects at edge)
   │
[Load Balancer]                 ← spread + HA (Part 2.5)
   │
[Stateless App Servers ×N]      ← scale horizontally (Part 2)
   │
[Redis Cache]  short→long       ← absorbs read-heavy redirects (Part 5.5)
   │ (miss)
[Database: sharded + replicated]← storage/write scale + read scale/HA (Part 21)
   │
[Queue → analytics workers]     ← click counts async (Part 13)

Code gen: [Machine-ID prefix + local counter]  (unique + shard key)
```

---

<a name="interview"></a>
# 12. Interview Q&A

### Q: "How do you generate the short code?"
> *"I'd use a counter with Base62 encoding — each incrementing number maps to a unique code, so no collisions, and it's simple and fast. For unpredictability at scale I'd use a Key Generation Service that pre-generates unique keys. I'd avoid pure hashing because truncating the hash causes collisions that get worse as the database fills, forcing DB checks and retries."*

### Q: "How do you keep it exactly 7 characters?"
> *"With hashing the encoded value is long, so I slice the first 7. With a counter, early numbers are short, so I either pad to 7 characters or start the counter high enough that every code is naturally 7 chars."*

### Q: "What's a collision and how do you handle it?"
> *"Two different URLs producing the same short code — because you're mapping unlimited URLs into a limited code space and truncating the hash. On generation I check the DB, and if the code's taken by a different URL, I regenerate until it's free. A counter avoids collisions entirely since each number is unique."*

### Q: "How do you scale for high traffic?"
> *"Cache first — Redis absorbs the read-heavy redirects so most skip the DB. Then horizontal app servers behind a load balancer, read replicas for DB reads, and sharding for storage and write throughput. I push analytics to a queue so redirects stay fast. A neat trick is prefixing codes with a machine ID — it makes codes unique across servers without coordination and doubles as the shard key."*

### Q: "301 or 302?"
> *"302, so every click hits my server and I can track analytics and change targets. Redis caching keeps those lookups around a millisecond, so the extra load is cheap. I'd only use 301 if analytics didn't matter and I wanted browsers to cache the redirect for minimum load."*

---

<a name="cheatsheet"></a>
# 13. Cheat Sheet

- **Shape:** read-heavy key-value lookup, ~100:1, HA + low latency.
- **Estimate:** ~40 w/s, ~4000 r/s, 6B URLs, 7-char Base62 (62⁷ ≈ 3.5T).
- **Core:** counter + Base62 (unique) or KGS; avoid hash (collisions).
- **Fixed length:** hash → slice 7; counter → pad 7 (or start high).
- **Collision:** different URLs → same code; check DB + regenerate; counter avoids it.
- **DB:** NoSQL key-value shortCode→longUrl.
- **Cache:** Redis cache-aside (high hit ratio); Redis also = counter + rate limit.
- **Scale:** LB + stateless servers + replicas + shard; **machine-ID prefix = unique code + shard key**.
- **Async:** click analytics via queue.
- **Redirect:** 302 (analytics) vs 301 (cached, low load).

*— Design Problem 01 complete —*
