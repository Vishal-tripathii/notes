# 🏗️ System Design (HLD) — Master Roadmap

> **Purpose:** the map for this folder. `System-design/` *is* the HLD track — no separate `HLD/` folder was created, because everything HLD needs (scalability, caching, DBs, delivery, messaging, security, scale patterns) already lives here across 26 parts. This file is what was missing: an index over those parts, and a **problems curriculum** on top of them — HLD is trained by solving whole systems ("design Twitter"), not by reading parts in isolation.
>
> **Companion file:** [`00-DESIGN-PROBLEM-FRAMEWORK.md`](00-DESIGN-PROBLEM-FRAMEWORK.md) is the **attack plan** — the 9-step flow to run on any problem below. This roadmap tells you *what to know*; that file tells you *what to do with it* in the room.
>
> **LLD counterpart:** [`../LLD/00-ROADMAP.md`](../LLD/00-ROADMAP.md) — HLD is "boxes and arrows for the whole system," LLD is "classes and patterns for one box." Different interview, different muscle.

---

## How this track works

Two layers, both already partly built:

```
1. Parts (below)     → the vocabulary: what a load balancer/cache/shard/queue IS and does
2. Problems (below)  → the drill: given a prompt, run the 9-step flow and produce a design
```

Parts 1–27 are **already written** (✅), and all 19 problems below now have a written solution in `Problems/`. HLD interview skill comes from repetition across *different signature challenges* (fan-out vs chunking vs seat-locking vs consistent hashing vs ledger-correctness vs event-time windowing), not from re-reading the parts.

---

## Progress tracker — parts

| # | Part | Status |
|---|---|---|
| 01 | Functional & non-functional requirements | ✅ done |
| 02 | Scalability | ✅ done |
| 02.5 | Load balancer deep dive | ✅ done |
| 02.6 | Reverse proxy | ✅ done |
| 02.7 | CDN | ✅ done |
| 03 | Latency, throughput & scaling | ✅ done |
| 04 | CAP theorem | ✅ done |
| 05 | Caching | ✅ done |
| 05.5 | Redis deep dive | ✅ done |
| 06 | Headers, cookies, JWT, sessions | ✅ done |
| 07 | HTTPS/SSL/TLS/encryption | ✅ done |
| 08 | Databases — SQL vs NoSQL | ✅ done |
| 09 | Database indexing | ✅ done |
| 10 | Database relationships | ✅ done |
| 11 | API design | ✅ done |
| 12 | GraphQL basics | ✅ done |
| 13 | Message queues | ✅ done |
| 14 | Event-driven architecture | ✅ done |
| 15 | Authentication vs authorization | ✅ done |
| 16 | JWT deep dive | ✅ done |
| 17 | OAuth, SSO, RBAC | ✅ done |
| 18 | Sessions | ✅ done |
| 19 | Password hashing | ✅ done |
| 20 | File upload design | ✅ done |
| 21 | High availability, replication, sharding | ✅ done |
| 22 | Design patterns | ✅ done |
| 23 | Rate limiting | ✅ done |
| 24 | Consistent hashing | ✅ done |
| 25 | Search & inverted index | ✅ done |
| 26 | WebSockets & realtime | ✅ done |
| 27 | Bloom filter | ✅ done |

> **All 27 parts written.** What's left is not reading — it's running the framework against unfamiliar prompts until the 9 steps come out unprompted. See the problems list below.

---

## Problems — the actual drill

Each problem names its **signature challenge** (the one hard part a strong answer must nail — see Framework step 5) and which parts you'll lean on. Work these **on demand**, not in strict order — pick whichever's signature challenge you're currently weakest on.

| # | Problem | Signature challenge | Leans on | Status |
|---|---|---|---|---|
| 01 | URL Shortener | Unique short-code generation (counter+Base62 / KGS / hash+collision) | 01, 03, 08, 09, 21 | ✅ done — [`Problems/problem-01-url-shortener.md`](Problems/problem-01-url-shortener.md) |
| 02 | Distributed Rate Limiter (as a system, not a class) | Counting algorithm at scale — sliding window in Redis, clock skew across nodes | 05.5, 23, 21 | ✅ done — [`Problems/problem-02-rate-limiter.md`](Problems/problem-02-rate-limiter.md) |
| 03 | Pastebin | Storage sizing + expiry (TTL cleanup at scale) | 01, 08, 20 | ✅ done — [`Problems/problem-03-pastebin.md`](Problems/problem-03-pastebin.md) |
| 04 | Twitter / News Feed | Fan-out on write vs fan-out on read, celebrity-user problem | 01, 03, 13, 14, 21 | ✅ done — [`Problems/problem-04-twitter-news-feed.md`](Problems/problem-04-twitter-news-feed.md) |
| 05 | Instagram / photo sharing | Media storage + CDN delivery, feed generation | 20, 21, 02.7 | ✅ done — [`Problems/problem-05-instagram.md`](Problems/problem-05-instagram.md) |
| 06 | WhatsApp / Chat system | Real-time delivery, ordering, offline delivery guarantees | 13, 26, 21 | ✅ done — [`Problems/problem-06-whatsapp-chat.md`](Problems/problem-06-whatsapp-chat.md) |
| 07 | Notification System | Multi-channel fan-out (push/email/SMS), dedup, retry | 13, 14 | ✅ done — [`Problems/problem-07-notification-system.md`](Problems/problem-07-notification-system.md) |
| 08 | Web Crawler | Politeness + dedup at massive scale, distributed frontier queue | 21, 24, 13 | ✅ done — [`Problems/problem-08-web-crawler.md`](Problems/problem-08-web-crawler.md) |
| 09 | Design a Distributed Cache (Redis-like) | Eviction, replication, consistent hashing across nodes | 05, 05.5, 21, 24 | ✅ done — [`Problems/problem-09-distributed-cache.md`](Problems/problem-09-distributed-cache.md) |
| 10 | Ride-Sharing (Uber HLD) | Geospatial matching (quad-tree/geohash) + real-time location updates | 21, 24, 26 | ✅ done — [`Problems/problem-10-uber-ride-sharing.md`](Problems/problem-10-uber-ride-sharing.md) |
| 11 | Video Streaming (YouTube/Netflix) | Chunked upload/transcode pipeline + adaptive-bitrate delivery via CDN — **plus §8.5: where YouTube and Netflix actually diverge** (UGC ingest vs curated catalog, reactive vs proactive caching, Open Connect, live streaming) | 02.7, 20, 21 | ✅ done — [`Problems/problem-11-video-streaming.md`](Problems/problem-11-video-streaming.md) |
| 12 | Dropbox / Google Drive | Chunking + dedup + multi-device sync/conflict resolution | 20, 21, 10 | ✅ done — [`Problems/problem-12-dropbox.md`](Problems/problem-12-dropbox.md) |
| 13 | Search Autocomplete / Typeahead | Trie/prefix index served with p99 latency under load | 25, 05 | ✅ done — [`Problems/problem-13-search-autocomplete.md`](Problems/problem-13-search-autocomplete.md) |
| 14 | Ticket Booking (BookMyShow HLD) | Inventory consistency under concurrent booking (no double-sell) at system scale | 04, 21 | ✅ done — [`Problems/problem-14-ticket-booking-bookmyshow.md`](Problems/problem-14-ticket-booking-bookmyshow.md) |
| 15 | API Gateway with rate limiting & auth | Cross-cutting concerns at the edge — auth, throttling, routing | 11, 23, 15 | ✅ done — [`Problems/problem-15-api-gateway.md`](Problems/problem-15-api-gateway.md) |
| 16 | **Payment System (UPI / Google Pay)** | **Money-correctness under failure** — idempotency keys, double-entry ledger, saga (not 2PC) across banks, reconciliation | 04, 08, 13, 14, 21 | ✅ done — [`Problems/problem-16-payment-system-upi.md`](Problems/problem-16-payment-system-upi.md) |
| 17 | **Food Delivery (Swiggy / Zomato)** | **Batched dispatch in a 3-sided marketplace** — delayed assignment timed to predicted prep-time, VRP batching heuristics, composed ETA | 13, 14, 21, 25, 26 | ✅ done — [`Problems/problem-17-food-delivery-swiggy-zomato.md`](Problems/problem-17-food-delivery-swiggy-zomato.md) |
| 18 | **E-commerce (Amazon / Flipkart)** | **Inventory reservation without overselling** — 3-number stock model + atomic conditional write, expiring holds, checkout saga, flash-sale hot row | 05, 08, 13, 14, 21, 25 | ✅ done — [`Problems/problem-18-ecommerce-amazon.md`](Problems/problem-18-ecommerce-amazon.md) |
| 19 | **Ad Click Aggregation / Analytics Pipeline** | **Event-time windowing & watermarks** — late/out-of-order events, exactly-once, Lambda vs Kappa, hot-key salting, HLL | 13, 14, 21, 24, 27 | ✅ done — [`Problems/problem-19-ad-click-aggregator.md`](Problems/problem-19-ad-click-aggregator.md) |

> **All 19 problems written.** What's left is not reading — pick one, redo it from a blank file timed to ~35-40 min, and name the signature challenge you under-explained.

> **Note on overlap with LLD:** #10 (Uber), #14 (BookMyShow) and rate limiting also appear in the [LLD roadmap](../LLD/00-ROADMAP.md) — deliberately. The HLD version asks "how does this scale across machines/regions"; the LLD version asks "how are the classes and concurrency inside ONE service modeled." Same domain, different interview.

---

## §x.5 — "How the real system does it" 🌐

**Every problem 01–15 now carries a `§x.5 How the real system does it` section**, sitting between the architecture diagram and the Interview Q&A. Problems 16–19 don't have one because they were written from that research directly; problem 11's equivalent is [§8.5 (YouTube vs Netflix)](Problems/problem-11-video-streaming.md#divergence).

**What goes in it:** the published architecture of the actual system — real constants, real names, and the places where production diverges from the textbook answer. **What it is for:** a design answer that quotes one real number at the moment it justifies a decision reads as engineering; the same answer without it reads as recitation. Deploy *one* detail where it earns its place — never recite the section as trivia.

Several of these sections **deliberately contradict the main body**, and that's the point — the disagreement is the learning:

| Problem | Where reality diverges from the standard answer |
|---|---|
| **05 Instagram** | The body says NoSQL. Instagram actually **sharded PostgreSQL**. Both defensible — the decision is per-workload, not per-company. |
| **06 WhatsApp** | The body sizes ~50–100K sockets/box. WhatsApp ran **~2M/server** — a 20–40× gap that comes from the concurrency model, not hardware. |
| **09 Distributed cache** | The body says consistent hashing. **Redis Cluster uses fixed hash slots instead** — same goal, simpler mechanism. |
| **08 Web crawler** | The body dedups *URLs*. The bigger real problem is duplicate **content** — needs SimHash, not a Bloom filter. |
| **14 Ticket booking** | A Redis lock is a **performance optimization, not a correctness guarantee** — the DB write must independently enforce uniqueness. |

**Two techniques recur across problems — spot them:**
- **A fixed, oversized intermediate layer between key and machine, remapped to scale** — Instagram's logical shards (§9.5) and Redis Cluster's 16,384 hash slots (§9.5) are the *same idea*.
- **Push the condition into the atomic operation instead of checking around it** — the rate limiter's Lua script (02 §10.5), the seat hold's `SET NX` (14 §8.5), inventory's conditional `UPDATE` (18 §4), and the idempotency key's unique constraint (16 §4a) are all one pattern.

---

## Read these in pairs — the contrasts are the point

Problems 16–19 were added specifically to cover signature challenges the first 15 didn't teach. Several are most useful read **against** an existing problem, because the *difference* is what the interviewer probes:

| Pair | The question it answers |
|---|---|
| **10 (Uber)** vs **17 (Food delivery)** | Matching (1:1, immediate) vs **batching + scheduling** (1:N, deliberately delayed). "It's Uber for food" is the wrong answer. |
| **14 (BookMyShow)** vs **18 (E-commerce)** | **Identified** inventory (seat A12 — lock a row) vs **fungible** inventory (any 1 of 500 — atomic counter). Cheaper primitive, much worse hot spot. |
| **16 (Payments)** → **17, 18** | The **idempotency + saga + reserve-then-consume** spine, reused in both. Learn it once here, apply it in three problems. |
| **19 (Ad clicks)** vs everything else | The only **"enormous write, approximate read"** shape — aggregate for speed, retain raw for truth. Also where YouTube's view-counting actually lives. |
| **11 §8.5** | YouTube vs Netflix — same spine, opposite caching strategy, because one catalog is knowable in advance and the other isn't. |

**Coverage note — commonly-asked systems and where they live:** Ola/Uber → #10 · Zomato/Swiggy → #17 · GPay/UPI/wallets → #16 · Amazon/Flipkart → #18 · Instagram → #05 · WhatsApp → #06 · Twitter/X → #04 · YouTube/Netflix → #11 (+§8.5) · BookMyShow → #14 · Dropbox/Drive → #12 · Google-Maps-style proximity → the geospatial core of #10 · Google Docs collab editing → [`scenario-bank/01-.../collaborative-editing-sync.md`](../scenario-bank/01-distributed-systems-reliability/collaborative-editing-sync.md) · Zoom/video calls → [`scenario-bank/10-.../realtime-video-sfu-vs-mcu.md`](../scenario-bank/10-system-design/realtime-video-sfu-vs-mcu.md).

---

## Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | Requirements+estimation · Caching (05/05.5) · Database choice+indexing · Load balancing+scaling (02/02.5/21) · The 9-step framework itself |
| ⭐⭐⭐⭐☆ | API design · Message queues/event-driven · Auth/JWT/OAuth · CDN · CAP theorem · Consistent hashing · Bloom filter |
| ⭐⭐⭐☆☆ | Design patterns · Rate limiting · WebSockets/realtime · Sessions · Password hashing |
| ⭐⭐☆☆☆ | GraphQL · Search/inverted index · File upload internals |

If you have one week left: requirements → caching → DB indexing → scaling/LB → the framework, run against 3 problems from the list above out loud.

---

## Revision strategy

- [ ] Re-read only the ✅ Checkpoint lines in [`00-DESIGN-PROBLEM-FRAMEWORK.md`](00-DESIGN-PROBLEM-FRAMEWORK.md) — that's the compressed version of the whole flow.
- [ ] Pick one unattempted problem above, run all 9 steps out loud, time yourself to ~35–40 min (interview length).
- [ ] After each attempt, name the signature challenge you missed or under-explained — that's the next thing to drill, not the next problem to add.
- [ ] Don't move to a new problem until you can say the 9 steps from memory without looking at the framework file.

---

## Connects to

- **[LLD track](../LLD/00-ROADMAP.md)** — same problem names sometimes recur (Uber, BookMyShow), at a different altitude.
- **[Node.js track](../nodejs/)** — Part 11 (API design), Part 07 (auth/security) sit underneath the API-design and auth parts here.
- **[scenario-bank/](../scenario-bank/00-README.md)** — `10-system-design/` catches failure/scale scenarios that don't belong in a full design write-up but are worth drilling separately.

*— Pick a problem, run the framework, write it into `Problems/` only once you've actually solved it out loud. —*
