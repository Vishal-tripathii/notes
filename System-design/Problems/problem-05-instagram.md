# Design Problem 05 — Instagram / Photo Sharing

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 20, 21, 02.7. **Signature challenge:** media storage + CDN delivery pipeline, and feed generation over a social graph. **Cousin of problem-04 (Twitter)** for the feed part — cross-reference it rather than re-deriving fan-out.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: media upload pipeline](#core)
5. [Database](#db)
6. [Caching + CDN](#cache)
7. [Feed generation](#feed)
8. [Scaling](#scaling)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Upload a photo with a caption.
2. Follow / unfollow other users.
3. View a feed of photos from people you follow.
4. Like and comment on photos.

**Non-functional:**
- **Read-heavy, and heavily skewed toward media bytes** — most bytes served are images, not API responses.
- **High availability** — feed and photo delivery should never hard-fail.
- **Low latency on reads** — feed scroll and image load must feel instant.
- **Eventual consistency acceptable** — a like count off by a few for a second is fine; a lost photo is not.
- **Massive, ever-growing storage** — photos are essentially never deleted.

> Read-heavy + media-dominated bytes + huge fan-out on reads → **the CDN, not the database, is the star of this design.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 500M DAU.

**Uploads:**
- ~2% of DAU upload a photo/day → **10M photos/day**
- Writes/sec: 10M ÷ 86,400 ≈ **~115/s** avg (peak burst 3–5× → ~500/s)

**Storage:**
- Each photo stored as original + thumbnail + a few resolutions ≈ **~500KB total** per photo across all variants.
- 10M/day × 500KB ≈ **5 TB/day** → ×365×5yr ≈ **~9 PB over 5 years**.

**Reads (feed views):**
- Each DAU scrolls ~100 photos/day → 500M × 100 = **50B photo views/day**
- Reads/sec ≈ 50B ÷ 86,400 ≈ **~580,000/s**
- **Read:write ratio ≈ 5,000:1** — far more skewed than a typical CRUD app.

**Bandwidth (the number that matters most here):**
- 50B views/day × ~200KB avg image served ≈ **~10 PB/day** of egress.
- ≈ 116 GB/s ≈ **~930 Gbps sustained** — this is *only* survivable by pushing almost all of it to edge CDN nodes; no origin fleet serves this directly.

> This is why capacity estimation for a media app is really a **bandwidth** estimation exercise, not a QPS one.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /api/uploads/init
Body: { "contentType": "image/jpeg" }
→ 200 { "photoId": "...", "uploadUrl": "https://s3.../presigned..." }

PUT <uploadUrl>                      ← client uploads bytes DIRECTLY to object storage
Body: <raw photo bytes>

POST /api/photos/{photoId}/complete
Body: { "caption": "...", "location": "optional" }
→ 201 { "photoId": "...", "status": "processing" }

GET /api/feed?cursor=...&limit=20
→ 200 { "posts": [...], "nextCursor": "..." }

POST /api/photos/{id}/like
POST /api/photos/{id}/comments
POST /api/users/{id}/follow
```

Note the **two-step upload**: `init` gets you permission, `complete` tells the app the bytes landed and it's safe to start processing.

---

<a name="core"></a>
# 4. Core: media upload pipeline 🎯

## Why the client uploads *directly* to object storage
The naive design routes photo bytes through the app server: `Client → App Server → Storage`. That's wrong at scale:
- App servers are sized for **request/response logic**, not for streaming GBs of binary traffic — every upload ties up an app-server connection/thread purely as a pass-through.
- It **doubles the network hop** (client→app, then app→storage) and doubles your egress/ingress bill on infrastructure that isn't built to serve bytes cheaply.
- It makes your app tier's capacity planning depend on **media traffic**, not API traffic — the two scale completely differently (bandwidth vs QPS).

**Fix: pre-signed URLs.** The app server (holding storage credentials) generates a short-lived, scoped URL that grants the client temporary permission to `PUT` directly to a specific object-storage key. The app server's job shrinks to: authenticate the user, issue the signed URL, record upload *intent* in the DB — object storage (S3-class) handles the actual byte transfer, and it's built to do that at near-unlimited scale.

```
Client → App Server: "I want to upload a photo"
App Server → Client: presigned PUT url (valid 5 min, scoped to one key)
Client → Object Storage: PUT bytes directly (app server never touches them)
Client → App Server: "done, here's the caption"
```

## Async processing after upload
The app server doesn't process the image inline — that would block the user on expensive work. Instead:

```
Upload complete (S3 event / client callback)
   → message pushed to Queue (photoId, storage key)
   → pool of Worker instances pick up the job
        - generate thumbnail (150×150)
        - generate feed-size resolution (640×640)
        - generate full-view resolution (1080×1080)
        - strip EXIF, run moderation/abuse scan
        - write each variant back to object storage
   → update DB: status "processing" → "ready"
   → trigger feed fan-out (see §7)
```

**Why multiple resolutions matter beyond UX:** serving a 4000×3000 original to a phone rendering a 150px thumbnail is pure wasted bandwidth — and bandwidth is the dominant cost in this system (see §2). Pre-generating the right size per context is a direct cost lever, not just a nicety.

---

<a name="db"></a>
# 5. Database *(Part 8)*

Four distinct access patterns, four different tools:

```
Photo:   photoId (PK) | ownerId | caption | createdAt | status | s3Key | resolutions[]
User:    userId (PK)  | username | ...
Follow:  followerId | followeeId          (composite, indexed both directions)
Like:    photoId | userId                  (composite PK — prevents double-likes)
Comment: commentId | photoId | userId | text | createdAt
```

- **Photo metadata** → NoSQL (DynamoDB/Cassandra), keyed by `photoId`, sharded by `ownerId`. Simple key lookups, no joins, needs to absorb ~115 writes/s and far more reads — NoSQL's horizontal scale fits better than a single relational primary.
- **Social graph (Follow)** → NoSQL wide-column, because the query is always "give me all followers/followees of X" — a simple partitioned scan, not a relational join. (Same shape as Twitter's graph — see problem-04.)
- **Likes/Comments** → NoSQL, extremely write-heavy, no cross-record transactions needed. Like **counts** are kept as approximate async counters (queue-updated, like problem-01's click analytics) rather than a `SELECT COUNT(*)` on every read — exact-to-the-second counts aren't worth the write contention.
- Account data that genuinely needs transactions (billing, auth) would still live in SQL — but the *core* photo/graph/engagement path is NoSQL end to end.

---

<a name="cache"></a>
# 6. Caching + CDN *(Parts 5, 5.5, 2.7)*

This is **the** dominant lever in an Instagram-shaped system — more than the DB, more than the app tier.

**CDN for images (the big one):**
- Photos are **immutable once uploaded** — a new upload gets a new key, nothing ever overwrites an existing one. That's the ideal cacheability property: set `Cache-Control: immutable, max-age=1yr` and let edge PoPs hold it forever.
- ~580,000 reads/s of image bytes (§2) would be impossible to serve from an origin fleet. With a CDN, only the first request per popular photo per region ever reaches origin storage — everything after that is edge-served in single-digit milliseconds, close to the user.
- **This is the real cost story:** ~930 Gbps sustained egress is a CDN bill line item, not a database problem. Every design decision upstream (multi-resolution generation, compression, immutable caching) exists to shrink that number.

**Redis for everything else:**
- Cache-aside for assembled **feed pages** (list of photoIds per user) — avoids recomputing/rereading the graph on every scroll.
- Cache hot **metadata** (captions, like counts) to keep the API-response path off the DB for popular posts.
- **Rate limiting** (INCR+TTL) on uploads and likes to blunt abuse — same pattern as problem-01.

---

<a name="feed"></a>
# 7. Feed generation *(cross-reference problem-04)*

The fan-out mechanics — **fan-out-on-write** (push a post into every follower's precomputed feed at post time) vs **fan-out-on-read** (pull posts from followees at feed-load time and merge) — are worked in full in **problem-04 (Twitter)**. Rather than re-deriving that trade-off here, the short version:

- **Fan-out-on-write:** cheap to *read* (feed is just a pre-built list), expensive to *write* if the poster has millions of followers (one post → millions of feed-list inserts).
- **Fan-out-on-read:** cheap to *write*, expensive to *read* (merge posts from every followee at request time).

**Where Instagram differs from Twitter:** typical Instagram users follow and are followed by hundreds, not the wild power-law extremes Twitter sees with celebrity accounts followed by tens of millions. That makes **fan-out-on-write the default, more heavily leaned-on choice** here — precomputing feed inserts for a few hundred followers per post is cheap and keeps reads trivially fast.

It still needs the same **hybrid escape hatch** as Twitter: for top influencer/celebrity accounts (millions of followers), fan-out-on-write would mean millions of writes per post — instead, those accounts are excluded from write-time fan-out, and their posts are merged in at **read time** when a follower loads their feed. Same hybrid idea, just a smaller slice of accounts need it.

---

<a name="scaling"></a>
# 8. Scaling *(Parts 2, 21)*

Order of impact for this problem: **CDN → cache → horizontal app servers → read replicas → shard DB → async pipeline.**

- **CDN** absorbs the overwhelming majority of read traffic (image bytes) before it ever reaches your infrastructure — this is the single biggest scaling lever, unlike a typical CRUD app where it's an afterthought.
- **Redis** absorbs feed-assembly and metadata reads that do reach the app tier.
- **Load balancer + stateless app servers** (Part 2.5) handle the (comparatively small) volume of control-plane requests: upload init, caption/complete, like/comment, feed cursor requests.
- **Read replicas** (Part 21) scale metadata/graph reads; **sharding** (Part 21) by `ownerId`/`photoId` scales storage and write throughput once a single DB node can't hold the graph or photo metadata.
- **Async pipeline** (queue + workers, Part 13/20) keeps thumbnail generation, moderation scanning, and feed fan-out off the upload's hot path — the user gets an immediate "processing" response, not a multi-second wait for image resizing.
- **Object storage** (S3-class) scales independently of everything else — it's already built to absorb petabytes and near-arbitrary request volume; it's not a bottleneck you design around, it's a given.

---

<a name="arch"></a>
# 9. Full architecture

```
[Users]
   │
[CDN]  ← serves nearly all photo bytes at the edge (Part 2.7, THE dominant lever)
   │ (cache miss only)
[Object Storage]  (originals + thumbnails + resolutions, S3-class, scales independently)
   ▲
   │ (async workers write variants here)
[Queue → Worker Pool]  ← thumbnailing, resolutions, moderation, feed fan-out (Part 20)
   ▲
[Load Balancer] → [Stateless App Servers ×N]   ← control plane only (Part 2.5)
   │                          │
[Redis]                 [Database: sharded + replicated]
 feed cache,              photo metadata / social graph /
 metadata cache,          likes / comments (NoSQL, Part 21)
 rate limiting

Upload path:  Client → App Server (presigned URL) → Client → Object Storage (direct)
Feed path:    Client → LB → App Server → Redis (feed list) → CDN (photo bytes)
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "Why not have the app server handle the photo upload directly?"
> *"Because app servers are sized for request/response logic, not for streaming gigabytes of binary data. Routing bytes through them doubles the network hop and ties up app-server capacity as a pure pass-through. Instead the app server issues a short-lived pre-signed URL and the client uploads straight to object storage, which is built to absorb that traffic cheaply."*

### Q: "How do you generate thumbnails without blocking the user?"
> *"On upload completion I push a message to a queue with the photo ID and storage key. A pool of workers picks it up, generates the thumbnail and other resolutions, runs moderation, and flips the photo's status to ready — all async. The user gets an immediate response instead of waiting on image processing."*

### Q: "How is the feed generated?"
> *"Same fan-out trade-off as Twitter — fan-out-on-write is cheap to read but expensive for high-follower accounts to write; fan-out-on-read is the opposite. Instagram leans more on fan-out-on-write by default since typical follower counts are much smaller than Twitter's celebrity extremes, but still needs a hybrid: top influencer posts are merged in at read time instead of fanned out to millions of followers at write time."*

### Q: "SQL or NoSQL for the social graph and likes?"
> *"NoSQL. The graph access pattern is always 'give me all followers of X' — a partitioned scan, not a join — and likes/comments are extremely write-heavy with no cross-record transactions needed. I'd keep like counts as approximate async counters rather than counting rows on every read."*

### Q: "What's the actual bottleneck at Instagram's scale?"
> *"Bandwidth, not compute or storage. Back-of-envelope, image egress lands around 900+ Gbps sustained — that's a CDN cost and architecture problem, not a database one. Every upstream decision — multiple resolutions, aggressive immutable caching, compression — exists specifically to shrink that number."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** read-heavy, bandwidth-dominated media app; read:write ≈ 5,000:1.
- **Estimate:** ~115 writes/s, ~580K reads/s, ~9PB storage/5yr, **~930 Gbps** image egress.
- **Core:** pre-signed URL → client uploads direct to object storage (never through app server); async queue+workers generate thumbnails/resolutions.
- **DB:** NoSQL everywhere on the core path — photo metadata, social graph, likes/comments; approximate async like counters.
- **CDN:** the dominant lever — photos are immutable, cache forever at the edge; origin barely touched.
- **Feed:** fan-out-on-write leaned on more than Twitter (smaller follower counts); hybrid fan-out-on-read for top influencers. Full derivation in problem-04.
- **Scale:** CDN → Redis → LB+stateless app servers → replicas → shard by owner/photo → async pipeline. Object storage scales independently.

*— Design Problem 05 complete —*
