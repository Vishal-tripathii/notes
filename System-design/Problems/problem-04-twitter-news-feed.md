# Design Problem 04 — Twitter / News Feed

> Worked end-to-end using the Master Framework (../00-DESIGN-PROBLEM-FRAMEWORK.md). Applies Parts 01, 03, 13, 14, 21. Signature challenge: fan-out on write vs fan-out on read, and the celebrity-user problem. Shape: extreme read:write ratio, social graph.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: fan-out strategy](#core)
5. [Database](#db)
6. [Caching + async fan-out](#cache)
7. [Scaling](#scaling)
8. [Bottlenecks & trade-offs](#bottlenecks)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Post a tweet (text ≤280 chars, optional media)
2. Follow / unfollow another user
3. View a **home timeline** — tweets from everyone you follow, in reverse-chronological order

*(Out of scope, mention only: likes, retweets, replies, search, notifications — same shape, add later.)*

**Non-functional:**
- **Extreme read:write ratio** — people scroll far more than they post. This is the single fact that drives the whole design.
- **Low latency reads** — the timeline has to feel instant on open/refresh.
- **High availability** — the feed should basically never be down.
- **Eventual consistency is fine** — if a follower sees your tweet 2–3 seconds late, nobody notices or cares.
- **Skewed social graph at massive scale** — hundreds of millions of users, most with a few hundred followers, a handful with 50M+ (celebrities). That skew is what makes this problem hard.

> Extreme read:write + skewed graph → **the core challenge is precomputing reads cheaply without one write becoming millions of writes.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume **200M DAU**, avg **0.5 tweets/user/day**, avg **20 timeline views/user/day**, avg **200 followers/user** (median is low; a small number of accounts have 10M–50M+).

**Writes (tweets):**
- Tweets/day: 200M × 0.5 = **100M tweets/day**
- Tweets/sec: 100M ÷ 86,400 ≈ **~1,150/s** avg, **~5,000/s** peak

**Reads (timeline views):**
- Reads/day: 200M × 20 = **4B reads/day**
- Reads/sec: 4B ÷ 86,400 ≈ **~46,000/s** avg, much higher at peak

**Read:write ratio:** 4B ÷ 100M = **~40:1** — and this *understates* it, because the read is cheap (one list fetch) only if we've already done the expensive part on the write side. That expensive part is fan-out:

**Fan-out write volume:**
- Fan-out writes/day: 100M tweets × 200 avg followers = **20B timeline insertions/day**
- Fan-out writes/sec: 20B ÷ 86,400 ≈ **~230,000/s** avg — and that's *before* accounting for celebrities, where one tweet alone can trigger tens of millions of insertions.

**Storage:**
- Tweet row (~300B: text + metadata): 100M/day × 300B ≈ 30GB/day → **~11TB/year** (media lives separately in object storage + CDN, not counted here)
- Follow graph: 200M users × 200 avg follows = 40B edges × ~16B/edge ≈ **~640GB**

> **Takeaway the numbers give you:** the *read* path (46K/s) must stay O(1) per request no matter what, and the *fan-out* path (230K/s+, bursty) has to be absorbed asynchronously — neither can run inline on the request that posts a tweet.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /tweet
Body: { "text": "...", "mediaUrls": ["..."] }
→ 201 { "tweetId": "...", "createdAt": "..." }

POST /follow/{userId}     → 204
DELETE /follow/{userId}   → 204

GET /timeline?cursor={opaque}&limit=20
→ 200 { "tweets": [ {...}, {...} ], "nextCursor": "..." }
```

**Cursor pagination, not offset.** New tweets keep arriving between page loads — `OFFSET 20` on a moving feed skips or repeats items. The cursor encodes the last seen `(timestamp, tweetId)`, so "next page" always means "everything older than this," regardless of what got inserted above it.

---

<a name="core"></a>
# 4. Core: fan-out strategy 🎯

The home timeline is the union of tweets from everyone you follow, merged by time. The question is: **compute that union at write time (push) or at read time (pull)?**

### A) Fan-out-on-write (push model)
When a user posts, immediately push the `tweetId` into a **precomputed timeline list** for every one of their followers.
```
User posts tweet → for each of my N followers → insert tweetId into follower's timeline cache
```
- ✅ **Reads are O(1)** — just read your own precomputed list. Since reads outnumber writes 40:1, this is exactly where you want the cost.
- ❌ **Celebrity problem:** a user with 50M followers posting = **50M writes triggered by one tweet.** That's a write storm that can overwhelm workers and stores, delay delivery, and burn work on followers who may never open the app that day.

### B) Fan-out-on-read (pull model)
Compute the timeline at read time: fetch the list of people you follow, pull each of their recent tweets, merge-sort by timestamp.
```
User opens timeline → fetch 500 followees → fetch recent tweets from each → merge → return
```
- ✅ **No celebrity problem** — posting a tweet is a single cheap insert, regardless of follower count.
- ❌ **Reads become expensive** — if you follow 500 people, *every* timeline load fans out into ~500 queries plus a merge. At 40:1 read:write, this flips the cost onto the path that runs 40x more often — the wrong trade.

### C) Hybrid — the real answer ✅
Use **fan-out-on-write for normal users**, and **fan-out-on-read (merge at read time) only for celebrity accounts.**

```
                 ┌──────────────────────────────┐
Normal user      │ Tweet → fan-out worker pushes │
posts            │ tweetId into EVERY follower's │──► Follower's Redis
                 │ precomputed timeline (async)  │    timeline list
                 └──────────────────────────────┘

                 ┌──────────────────────────────┐
Celebrity        │ Tweet → written to tweet DB   │
(>threshold      │ store only. NOT pushed to     │──► sits in celeb's own
followers)       │ millions of follower lists.   │    tweet timeline
posts            └──────────────────────────────┘

                 ┌──────────────────────────────────────────┐
Follower reads   │ GET /timeline =                            │
their timeline   │   read precomputed list (Redis, O(1))      │
                 │ + pull-merge recent tweets from the FEW     │
                 │   celebrities this follower follows         │
                 │ → sort by time → return                     │
                 └──────────────────────────────────────────┘
```

Why this works: a normal account's fan-out cost is bounded by its (small) follower count, so the aggregate write volume stays proportional and manageable. Celebrity tweets skip the expensive push entirely — they're merged in lazily. And because any *given* reader follows only a handful of celebrities (even if a celebrity has millions of followers), the extra read-time merge work per request stays small. This caps **both** the worst-case write amplification and the worst-case read latency — each strategy is used exactly where it's cheap.

| | Fan-out-on-write | Fan-out-on-read | Hybrid |
|---|---|---|---|
| Read cost | O(1) ✅ | O(followees) ❌ | O(1) + tiny merge ✅ |
| Write cost | O(followers) ❌ for celebs | O(1) ✅ | O(followers), but celebs excluded ✅ |
| Celebrity problem | Explodes | None | Solved (excluded from push) |
| Matches 40:1 read-heavy shape | Only for normal users | No | Yes |

---

<a name="db"></a>
# 5. Database *(Part 8)*

**Tweet storage** — wide-column / NoSQL fits a write-once, read-by-key pattern well:
```
tweetId (PK) | authorId | text | mediaUrls | createdAt
```
Sharded/partitioned by **authorId** so "get this user's recent tweets" (needed both for a user's own timeline and for the on-read celebrity merge) stays a single-partition query instead of a scatter-gather.

**Follow-graph storage** — an **adjacency list**, not a relational join table:
```
following: userId (partition key) → [followeeId, followeeId, ...]
followers: userId (partition key) → [followerId, followerId, ...]
```
The only two queries this graph ever needs are "who does X follow" and "who follows X" — no multi-hop traversal, no joins. A graph database is overkill for that access pattern; a key-value/wide-column store with `userId` as the partition key and edges as the value answers both in a single lookup and scales the same way the rest of the system does.

Both tweets and the follow graph are **sharded by user ID**, so a given user's own data — their tweets, their follow list, their followers — stays local to one shard for the queries that matter most.

---

<a name="cache"></a>
# 6. Caching + async fan-out *(Parts 5, 5.5, 13, 14)*

**Precomputed timeline cache:** one Redis list/sorted set per user, keyed by `userId`, holding the most recent ~800 `tweetId`s ordered by time (capped so memory per user stays bounded).

**Write path (post a tweet):**
```
1. Write tweet to DB (source of truth) — fast, single insert.
2. Push tweetId onto the author's own tweet list.
3. Enqueue a fan-out job onto a message queue (Part 13/14) — do NOT fan out inline.
4. POST /tweet returns immediately (~ms), regardless of follower count.

Meanwhile, asynchronously:
5. A pool of fan-out workers pulls the job, looks up the author's follower list,
   and — for non-celebrity authors — LPUSH + LTRIM the tweetId into each
   follower's Redis timeline list.
6. Celebrity authors (over the follower threshold) are skipped here entirely;
   their tweets are picked up at read time instead.
```
Decoupling the fan-out into a queue is what keeps tweet posting fast no matter how many followers someone has — the expensive, follower-count-proportional work happens off the hot path, and worker capacity can be scaled independently of request traffic.

**Read path (view timeline):**
```
GET /timeline → read precomputed list from Redis (O(1))
             → batch-fetch tweet content for those tweetIds
             → merge in recent tweets from any celebrities this user follows
             → sort by time → return page (cursor-paginated)
```

---

<a name="scaling"></a>
# 7. Scaling *(Parts 2, 21)*

- **Shard tweets and timelines by `userId`** (consistent hashing) — keeps a user's reads/writes on one node and avoids hot-spotting the whole cluster on one shard.
- **Fan-out workers scale horizontally**, consuming a queue partitioned by author or follower-shard, so burst load (a normal-but-large account tweeting) is absorbed by adding workers, not by blocking writers.
- **Read replicas** on the tweet store absorb cold-cache reads and the celebrity on-read merges.
- **Redis is itself clustered and sharded by `userId`**, with replication for failover — the timeline cache can't be a single point of failure given it's on the hot read path.
- **CDN** in front of media attachments — never serve images/video off the app tier.

Order of impact, same as any read-heavy system: **cache → horizontal app servers → read replicas → sharding → async workers.**

---

<a name="bottlenecks"></a>
# 8. Bottlenecks & trade-offs *(Part 4)*

**Celebrity problem, revisited.** The hybrid design removes the *write* explosion — a celebrity tweet is one DB write, not millions of pushes. It does **not** remove all celebrity cost: every follower who has that celebrity in their follow list pays a small on-read merge. That stays cheap only because any single user follows relatively few celebrities. The edge case — celebrities who follow other celebrities — is handled the same way: the threshold is applied per-account, not per-relationship, so it doesn't matter who's on the other end.

**Eventual consistency is a deliberate CAP choice.** Fan-out happens asynchronously through a queue, so a follower can see a new tweet a few seconds late. Per CAP, that's choosing **availability + partition tolerance over strict consistency (AP)** for the timeline — the right call, because a feed that's briefly stale is invisible to the user, unlike say a bank balance where staleness is unacceptable.

**Cold start / empty timeline.** A brand-new account has nothing precomputed in Redis yet. Fall back to an on-read pull (same mechanism used for celebrities) until enough fan-out history accumulates.

**Hot shard risk.** A single viral tweet concentrates read load (likes/replies/views) on one tweet's shard even though fan-out itself is fine — mitigated by the same Redis caching plus read replicas, not by anything special in the fan-out logic.

**Bounded memory.** Capping each user's precomputed list (~800 tweets) keeps Redis memory per user constant regardless of how prolific the people they follow are; older items are recomputed via the DB/on-read path if ever needed.

---

<a name="arch"></a>
# 9. Full architecture

```
[Users]
   │
[Load Balancer]                         ← spread + HA (Part 2.5)
   │
[Stateless App Servers ×N]              ← POST /tweet, POST /follow, GET /timeline
   │                    │
   │ (write path)       │ (read path)
   ▼                    ▼
[Tweet DB]          [Redis: per-user     ← precomputed timeline cache,
 sharded by            timeline lists]     O(1) read (Part 5.5)
 authorId                   │
   │                        │ (merge in celeb tweets on read)
   │                        ▼
   │                  [Tweet DB read replicas]  ← celeb pull + cache misses
   │
   ▼
[Message Queue]                         ← fan-out job per new tweet (Part 13/14)
   │
[Fan-out Workers ×N]
   │  for each follower of a NON-celebrity author:
   ▼
[Redis: push tweetId into follower's timeline list]

Follow graph: [userId → following[]] / [userId → followers[]]  (adjacency list, sharded by userId)

Media: [Object Store] → [CDN]           ← never on the app tier
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "How would you generate the home timeline?"
> *"I'd start from the read:write ratio — timeline views massively outnumber tweets, so I want the read to be O(1). That means precomputing: fan-out-on-write pushes a new tweet into every follower's cached timeline list the moment it's posted, so reading is just one list fetch."*

### Q: "What breaks with fan-out-on-write at scale?"
> *"Celebrities. If someone has 50 million followers, one tweet becomes 50 million writes — a fan-out storm that can overwhelm the workers and delay delivery for everyone. Fan-out-on-read avoids that because posting is a single cheap insert, but then every timeline read has to merge tweets from every person you follow live, which is expensive on the path that runs 40x more often than writes. Neither pure strategy is right on its own."*

### Q: "So what do you actually do about the celebrity problem?"
> *"A hybrid: normal users still get fan-out-on-write, so most reads stay O(1). Accounts above a follower threshold are excluded from the push entirely — their tweets just sit in the tweet store. At read time, I merge in the recent tweets from any celebrities the requester follows. That merge stays cheap because any one person follows only a handful of celebrities, even though each celebrity has millions of followers."*

### Q: "Why does fan-out need to be asynchronous?"
> *"Because push cost is proportional to follower count, and I don't want a user with a large-but-not-celebrity following to make POST /tweet slow. I write the tweet to the DB and enqueue a fan-out job, then return immediately. A pool of workers processes the queue and pushes into followers' Redis lists in the background, so posting latency stays constant regardless of audience size."*

### Q: "Is it a problem if a follower doesn't see a tweet instantly?"
> *"No — that's an accepted trade-off. The fan-out queue introduces a few seconds of lag in the worst case, which is a deliberate availability-over-consistency choice under CAP. A social feed being briefly stale isn't something users notice or that causes harm, unlike domains where staleness is unacceptable, like financial balances."*

### Q: "How do you shard this?"
> *"Both tweets and the follow graph are sharded by userId, so a user's own tweets, their follow list, and their followers stay on one shard for the queries that actually get run — 'this user's tweets' and 'who does/does not follow this user.' The follow graph itself is stored as a simple adjacency list, not a relational graph DB, because I only ever need those two lookups, never multi-hop traversal."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** extreme read:write (~40:1+), skewed social graph, eventual consistency OK.
- **Estimate:** ~1,150 tweets/s (5K peak), ~46,000 reads/s, ~230,000 fan-out writes/s, ~11TB tweets/year.
- **Core:** fan-out-on-write (fast reads, celebrity write storm) vs fan-out-on-read (no celebrity problem, slow reads) → **hybrid**: push for normal users, pull-merge for celebrities at read time.
- **DB:** tweet store sharded by authorId; follow graph as adjacency list (`userId → []`), sharded by userId — no graph DB needed, only two query shapes exist.
- **Cache:** per-user precomputed timeline list in Redis, capped length, O(1) read; fan-out done by async workers off a queue so posting stays fast regardless of follower count.
- **Scale:** shard by userId (tweets + graph) → horizontal fan-out workers → read replicas → Redis cluster + replication → CDN for media.
- **Trade-offs:** celebrity reads still do a small bounded merge; timeline lag is an intentional AP choice under CAP; cap list length to bound cache memory; new-account cold start falls back to on-read pull.

*— Design Problem 04 complete —*
