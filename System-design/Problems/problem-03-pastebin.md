# Design Problem 03 — Pastebin

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 01, 08, 20. Signature challenge: storage sizing + TTL-based expiry cleanup at scale. Shape: read-heavy blob storage with optional expiry, close cousin of the URL shortener (problem-01) — note the similarity and the key difference (paste content size varies widely vs a fixed-size URL).

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: ID generation](#core)
5. [Database](#db)
6. [Caching (Redis)](#cache)
7. [Expiry mechanism](#expiry)
8. [Scaling](#scaling)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. User can create a paste (submit text) → gets back a short unique URL (`paste.ly/aB3xK9p`).
2. User can retrieve a paste by ID → sees the raw content.
3. *(Optional)* custom URL alias, expiration time (10 min / 1hr / 1 day / never), syntax-highlighting language tag, password protection.

**Non-functional:**
- **Read-heavy** — pastes are shared and viewed far more than created (similar ratio to URL shortener, ~10:1 to 100:1 depending on virality).
- **Durable** — a paste shouldn't silently disappear before its expiry.
- **Low latency reads** — viewing a paste should feel instant.
- **Size limit** — cap paste size (e.g. 10 MB) to bound storage and abuse.
- Scalable to billions of pastes.

> Same shape as the URL shortener (problem-01): both are "generate a short ID → look up a value by that ID, read-heavy." **The difference:** a URL is always tiny (~500 bytes); paste *content* varies from a few bytes to megabytes. That size variance is what forces a different storage decision (Section 5) and adds a whole new concern the URL shortener didn't have: **expiry cleanup** (Section 7).

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 1M new pastes/day, 10:1 read:write, avg paste size **10 KB** (median much smaller, but code dumps/logs pull the average up).

- **Writes/sec:** 1M ÷ 86,400 ≈ **~12/s**
- **Reads/sec:** 12 × 10 ≈ **~120/s** (spikes much higher — a paste shared on a busy thread can spike to thousands of reads/s)
- **Storage (content):** 1M/day × 365 × 10 KB ≈ **~3.6 TB/year**
- **Storage (metadata only, ~200B/row):** 1M × 365 × 200B ≈ **~73 GB/year** — trivial, fits comfortably in a regular DB even at 5yr scale.

**Takeaway:** metadata is cheap and stays in the primary DB forever; **content** is the heavy part and dominates the storage bill — this is *why* content and metadata get split into two different stores (Section 5).

**ID length (Base62, reuse problem-01's math):** 62⁷ ≈ 3.5 trillion — same 7-char code comfortably covers billions of pastes.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /api/pastes
Body: { "content": "...", "expiresIn": "1d", "language": "python",
        "customAlias": "optional", "password": "optional" }
→ 201 { "pasteUrl": "https://paste.ly/aB3xK9p" }

GET /{pasteId}
→ 200 { "content": "...", "language": "python", "createdAt": "..." }
→ 404 if not found or expired
→ 401 if password-protected and no/wrong password supplied

GET /{pasteId}/raw
→ 200 text/plain (raw content, no wrapper — for `curl` / editor use)
```

---

<a name="core"></a>
# 4. Core: ID generation 🎯

Identical problem to the URL shortener's short-code generation — **reuse it rather than re-deriving it.** See **[problem-01 Section 4](problem-01-url-shortener.md#core)** for the full walkthrough of hash-vs-counter-vs-KGS.

**Short version:** global counter → **Base62-encode** → 7-char paste ID. No collisions (each number is unique by construction), simple, fast. Same distributed-counter fix applies too — **machine-ID prefix** (problem-01 Section 9) gives unique IDs across app servers with zero coordination, and doubles as a shard key here as well.

One paste-specific wrinkle: **custom alias.** If the user supplies one, skip ID generation and just check-and-insert the alias directly (unique constraint on the column) — reject with 409 if taken.

---

<a name="db"></a>
# 5. Database *(Part 8)* — the interesting split

This is where pastebin diverges from the URL shortener. A URL is always ~500 bytes, so the whole row lives happily in one DB table. Paste content ranges from a few bytes to megabytes — storing that inline in a relational/NoSQL DB row bloats indexes, slows backups, and wastes expensive DB storage on what's really just a blob.

**Split by size:**

| | **Metadata** (always) | **Content** |
|---|---|---|
| Where | SQL/NoSQL DB | Small (< ~1KB): inline in DB row. Large: **object storage** (S3/GCS) |
| Why | Small, fixed-size, queried often | Large & variable — object storage is built for cheap blob storage at scale |
| Schema | `pasteId(PK) \| contentPtr \| size \| language \| createdAt \| expiresAt \| userId \| passwordHash` | `contentPtr` = either the inline text or an S3 object key (`s3://pastes/aB3xK9p`) |

**Read path:** fetch metadata row by `pasteId` → if content is inline, done; if `contentPtr` is an S3 key, fetch the blob from S3 (or better, let S3/CDN serve it directly once you have the key — Section 8).

**NoSQL fits well** for metadata too (DynamoDB/Cassandra) — it's a simple key lookup on `pasteId`, no joins needed, shards naturally on `pasteId`. SQL is fine at smaller scale.

---

<a name="cache"></a>
# 6. Caching (Redis) *(Parts 5, 5.5)*

Reads dominate, and popular pastes (a shared snippet, a viral gist) get re-read heavily in a short burst — classic **cache-aside**:

```
GET aB3xK9p → Redis? HIT ✅ return (~1ms) / MISS ❌ → DB (+ S3 if large) → store in Redis → return
```

- Cache **small/medium pastes in full**; for very large pastes, cache just the metadata and let S3/CDN handle serving the blob (don't blow up Redis memory with megabyte-sized values).
- **Set the Redis TTL to match (or be shorter than) the paste's own expiry** — no point caching something that's about to become invalid, and it saves you a stale-read bug.
- Redis's usual 3 jobs apply here too: ① cache hot pastes ② atomic counter for ID generation ③ rate limiting paste creation (INCR+TTL) to stop spam/abuse.

---

<a name="expiry"></a>
# 7. Expiry mechanism 🎯

The signature challenge unique to this problem: pastes can have a TTL (`expiresAt`), and expired pastes must stop being served and eventually be *removed* — reclaiming storage — without hurting read latency.

### Option A: Lazy deletion (check-on-read)
On every `GET`, compare `now > expiresAt`. If expired: return 404 and delete the row (or mark it deleted) right there.
- ✅ Zero extra infrastructure, trivially correct (expired pastes are never served, no matter what).
- ❌ **A paste nobody ever reads again stays in storage forever** — it's never triggered, so it never gets cleaned up. Storage grows unbounded from "dead" pastes.

### Option B: Background sweep job
A periodic job (cron / scheduled worker) scans for `expiresAt < now` and bulk-deletes rows + associated S3 objects.
- ✅ Actually reclaims storage over time, runs independent of traffic.
- ❌ Extra moving part; a full-table scan is expensive at billions of rows — needs an **index on `expiresAt`**, or better, **bucket pastes by expiry window** (e.g. a sorted set in Redis keyed by expiry timestamp, or partition the table by day) so the sweep only touches the bucket that just expired instead of scanning everything.
- ❌ There's a window between expiry and the sweep running where a paste is *logically* expired but still in the DB — the read path must still lazy-check `expiresAt`, so this doesn't remove the need for Option A's check.

### ✅ Do both
Lazy check on read (correctness — never serve an expired paste, even one second after expiry) **+** background sweep (hygiene — actually frees storage for pastes nobody comes back to read). This is the same pattern as TTL cache eviction: check-on-access catches the common case cheaply, a background reaper handles the long tail.

> **Interview framing:** *"Lazy deletion alone leaks storage; a sweep alone leaves a correctness gap between expiry and the next sweep run. Run both — lazy check guarantees correctness, the sweep guarantees storage doesn't grow unbounded."*

---

<a name="scaling"></a>
# 8. Scaling *(Parts 2, 2.5, 21)*

Order of impact: **cache → horizontal app servers → object storage + CDN for content → read replicas (metadata) → shard (metadata) → async sweep job.**

- **Load balancer** (Part 2.5): spreads traffic across stateless app servers, health checks, HA.
- **CDN in front of object storage** (Part 2.7): once content lives in S3, put a CDN in front of it — large/popular pastes get served from the edge, never touching your app servers at all.
- **Replication + sharding on metadata** (Part 21): metadata DB shards on `pasteId` (same machine-ID-prefix trick as problem-01 — prefix doubles as shard key); read replicas absorb the metadata read load.
- **Async** (Part 13): the expiry sweep job runs off the hot path entirely, as does any click/view-count analytics.

---

<a name="arch"></a>
# 9. Full architecture

```
[Users]
   │
[CDN]  (serves large/popular paste content at the edge)
   │
[Load Balancer]                     ← spread + HA
   │
[Stateless App Servers ×N]          ← scale horizontally
   │
[Redis Cache]  pasteId→content/meta ← absorbs read-heavy views
   │ (miss)
[Metadata DB: sharded + replicated] ← pasteId, expiresAt, contentPtr, ...
   │
[Object Storage (S3)]               ← large paste content, CDN origin
   │
[Background sweep worker]           ← deletes expired rows + S3 objects (indexed/bucketed by expiresAt)

ID gen: [Machine-ID prefix + local counter Base62]  (reused from problem-01)
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "How is this different from the URL shortener you just designed?"
> *"Structurally identical — short ID, read-heavy lookup, same ID generation. The real difference is content size: a URL is always small and fits inline in one DB row, but paste content ranges from bytes to megabytes, so I split storage — small pastes inline in the DB, large ones in object storage like S3 with just a pointer in the metadata row. That size variance also introduces expiry, which the URL shortener doesn't really need to worry about."*

### Q: "Where do you store the paste content?"
> *"Split by size. Metadata — ID, expiry, language, a content pointer — always lives in the DB since it's small and fixed-size. Content itself: if it's small I store it inline to save a round trip, but past a threshold I push it to object storage, because blob storage is built for cheap storage at scale and keeps my DB rows and indexes small and fast."*

### Q: "How do you handle expiry?"
> *"Two mechanisms together. On every read I lazily check if `expiresAt` has passed and return 404 if so — that guarantees correctness immediately, but on its own it leaks storage since a paste nobody reads again never gets cleaned up. So I also run a background sweep job that periodically deletes expired rows and their S3 objects, indexed or bucketed by expiry time so it doesn't have to scan the whole table. Lazy check gives correctness, the sweep gives storage hygiene."*

### Q: "How would you avoid a full table scan in the sweep job?"
> *"Index on `expiresAt`, or better, bucket pastes by their expiry window — like a sorted set in Redis keyed by expiry timestamp, or daily table partitions — so the sweep only touches the bucket that just came due instead of scanning everything."*

### Q: "How do you scale reads for a viral paste?"
> *"Redis cache-aside in front of the metadata/small content, same as the URL shortener. For large content, a CDN sitting in front of object storage means a viral paste gets served from the edge and never touches my app servers or DB at all — that's actually the more important lever here since paste content can be big."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** read-heavy blob storage with optional TTL; cousin of URL shortener (problem-01), key difference = variable content size.
- **Estimate:** ~12 w/s, ~120 r/s (spiky), ~3.6 TB/yr content, ~73 GB/yr metadata.
- **ID gen:** reuse problem-01 — counter + Base62 (+ machine-ID prefix for uniqueness/sharding).
- **DB split:** metadata (small, always DB) vs content (small inline / large → S3 object storage + pointer).
- **Cache:** Redis cache-aside for hot pastes; cache TTL ≤ paste's own expiry.
- **Expiry 🎯:** lazy check-on-read (correctness) + background sweep job indexed/bucketed by `expiresAt` (storage hygiene) — do both.
- **Scale:** LB + stateless servers + CDN over object storage (biggest lever for large content) + sharded/replicated metadata DB + async sweep.

*— Design Problem 03 complete —*
