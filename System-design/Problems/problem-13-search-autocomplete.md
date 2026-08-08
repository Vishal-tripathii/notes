# Design Problem 13 — Search Autocomplete / Typeahead

> Worked end-to-end using the Master Framework (../00-DESIGN-PROBLEM-FRAMEWORK.md). Applies Parts 25, 05. Signature challenge: serving prefix-match suggestions at p99 sub-100ms latency under heavy read load, with a data structure updated from a slow offline pipeline.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: the Trie](#core)
5. [Building/updating the trie](#building)
6. [Caching](#cache)
7. [Scaling](#scaling)
8. [Full architecture](#arch)
9. [Interview Q&A](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Given a partial query (what the user has typed so far), return the **top-K** most likely completions (e.g. K=5–10).
2. Rank suggestions by **popularity/frequency**, with some weight toward **recency** (trending queries should surface, not just historically popular ones).
3. Suggestions should update as search trends shift — not fixed at launch, but doesn't need to reflect the last 5 seconds.

**Non-functional:**
- **Extreme read load** — every keystroke is a request, not just every submitted search.
- **p99 latency sub-100ms** — anything slower and the suggestions visibly lag behind typing, feels broken.
- **Read availability over strict freshness** — showing slightly-stale top suggestions is fine; showing *no* suggestions or a slow UI is not.
- Doesn't need strong consistency — this is a ranked-suggestion feature, not a transactional system.

> The defining shape: **read:write ratio is not 100:1 like a URL shortener — it's more like 10,000:1+**, because "writes" here aren't even live user actions, they're a periodic offline rebuild. This completely changes the design: **optimize purely for read latency; treat updates as a batch problem, not a live one.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 100M daily active searchers, each performing ~3 searches/day, average query length ~20 characters.
- **Search submissions/day:** 100M × 3 = 300M.
- **But autocomplete fires on every keystroke**, not every submission — average ~15 keystrokes before a user picks a suggestion or hits enter → **300M × 15 ≈ 4.5B keystroke-triggered requests/day.**
- **QPS:** 4.5B ÷ 86,400s ≈ **~52,000 requests/sec average**, with strong peak multipliers (daytime traffic, trending events) → design for **~150–200K QPS at peak.**
- **Data size:** even a huge vocabulary of distinct prefixes (tens of millions of unique query strings, each needing a top-K list) is small in absolute bytes — a few GB to tens of GB — **the whole structure comfortably fits in memory** on a modern server, which is the single most important capacity fact here.
- **Update volume:** query logs processed in batches (hourly/daily), not per-request — this is a completely separate, much lower-throughput pipeline.

> **The whole problem is: ~150K+ reads/sec against an in-memory structure, sub-100ms, vs. a comparatively tiny, infrequent update job.** Read scaling dominates every decision.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
GET /suggest?q=piz
→ 200 {
    "query": "piz",
    "suggestions": [
      { "text": "pizza near me", "score": 98234 },
      { "text": "pizza hut", "score": 87211 },
      { "text": "pizza recipe", "score": 45011 },
      { "text": "pizza delivery", "score": 41200 },
      { "text": "pizza dough", "score": 30044 }
    ]
  }
```
- Fired on **every keystroke** client-side, typically debounced ~50–100ms so a fast typist doesn't fire a request per character.
- Read-only, cacheable, idempotent — a perfect fit for aggressive HTTP/CDN caching on top of the app-level cache.
- No pagination needed — top-K is fixed and small (K=5–10); this is not a list endpoint.

---

<a name="core"></a>
# 4. Core: the Trie 🎯

## Why a trie
A **trie (prefix tree)** stores strings so that every node represents one shared prefix, and all strings sharing that prefix share the same path from the root.
```
root
 └─ p
     └─ i
         └─ z
             └─ z
                 └─ a          → "pizza"
                     ├─ ' '─n─e─a─r─' '─m─e     → "pizza near me"
                     └─ ' '─h─u─t                → "pizza hut"
```
Looking up everything that starts with `"piz"` is: **walk 3 nodes down (p→i→z), then everything in that subtree is a valid completion.** That's O(prefix length) to find the subtree — independent of how many total strings are stored.

## The naive trie is still too slow
Finding the subtree is fast, but the subtree for a popular prefix like `"a"` can contain **millions** of completions. Walking/scanning that whole subtree at *query time* to find the top-K by frequency would blow the latency budget badly — that's the actual bottleneck, not the prefix walk.

## The fix: cache top-K AT each node ✅
**Every node in the trie stores its own precomputed list of the top-K most frequent completions for the prefix ending at that node** — not just at leaves, at every single node along the way.
```
node "piz" → cachedTopK: ["pizza near me", "pizza hut", "pizza recipe", "pizza delivery", "pizza dough"]
```
So a query for `"piz"` is: walk 3 nodes to reach that node, **read its precomputed list, done.** No subtree scan, no runtime aggregation, no sorting — just a pointer to an already-sorted array.

## The trade-off being made
- **Memory cost:** every node duplicates a top-K list (same completions get stored redundantly at multiple ancestor nodes — `"pizza hut"` appears in the cached list of the `"p"` node, the `"pi"` node, the `"piz"` node, etc.). This inflates memory usage roughly by a factor related to K and the depth of shared prefixes.
- **Query speed gain:** query time drops from "scan a potentially huge subtree" to "O(prefix length) walk + O(1) array read" — a small, bounded, predictable cost regardless of how popular or deep the prefix is.
- **This is exactly the space-for-speed trade every senior answer should name explicitly:** *"I'm willing to spend extra memory — which is cheap and the whole structure fits in RAM anyway — to make every single query, even for the most popular prefixes, a constant-time lookup instead of a scan whose cost depends on data popularity."*

> **Interview one-liner:** *"A plain trie gets you to the right subtree fast, but ranking that subtree's contents at query time doesn't scale for popular prefixes. So I precompute and cache the top-K completions at every node during the build step, not just leaves — a query becomes a prefix walk plus reading an already-ranked array, which is why it stays fast under heavy load."*

---

<a name="building"></a>
# 5. Building/updating the trie

**The trie is never updated live, per-query.** At 150K+ QPS, incrementing a counter and re-sorting a top-K list on every single keystroke-triggered request would be far too expensive and would also mean every read potentially contends with a write — exactly the kind of live-write cost this design is built to avoid.

Instead:
```
[Search query logs] ──▶ [Batch job, hourly/daily] ──▶ recompute frequency counts per query string
                                                    ──▶ rebuild trie + top-K caches at every node
                                                    ──▶ publish new trie snapshot
                                                             │
                                              [Suggestion servers] load/swap to new snapshot
```
- Query logs (every submitted search, not every keystroke) accumulate in a log/warehouse; a periodic batch job (Part 13/14-style pipeline, or a scheduled Spark/MapReduce job) aggregates frequency counts, optionally weighting recent activity higher to capture trends.
- The job **rebuilds the whole trie structure** (or the affected portions) offline, then **publishes a new immutable snapshot** — servers atomically swap to the new version rather than mutating a live structure. This means the read path never has to coordinate with a writer at all — reads only ever touch a finished, immutable structure.
- **Trade-off stated out loud:** suggestions lag real-world trends by the batch interval (an hour, a day) — acceptable because autocomplete is a "roughly right, very fast" feature, not a real-time correctness-critical one. A genuinely fast-breaking trend (a live event) can be handled with a small separate "trending overrides" layer merged in at query time, rather than rebuilding the whole trie more often.

---

<a name="cache"></a>
# 6. Caching *(Part 5)*

- **The trie itself IS the cache, in a sense** — because the whole structure fits in memory (see estimation), each suggestion server just holds a full **in-memory copy** of the current trie snapshot. There's no DB round-trip on the read path at all — that's what makes sub-100ms achievable.
- On top of that, a **Redis layer in front of the trie service** can cache the *response* for the hottest prefixes (`"a"`, `"the"`, common single/double letters get a disproportionate share of traffic) — cache-aside, same pattern as Part 5: check Redis first, fall back to the local trie lookup, store the result.
- Because the trie snapshot only changes on the batch cadence (hourly/daily), **cache invalidation is trivial** — there's no live-write race to worry about; just flush/expire the cache whenever a new snapshot is published, or let short TTLs handle it naturally.
- **CDN edge caching (Part 2.7)** is also viable for the most common prefixes since responses are identical for all users (no personalization assumed) — pushes the absolute hottest lookups even closer to the user.

---

<a name="scaling"></a>
# 7. Scaling

This is a **much simpler scaling story than a typical live database**, precisely because the data is read-only from the servers' point of view between rebuilds:
```
[Load Balancer] → [Suggestion Server 1: full trie in RAM]
                → [Suggestion Server 2: full trie in RAM]
                → [Suggestion Server 3: full trie in RAM]
                → ... [Suggestion Server N: full trie in RAM]
```
- Every server holds an **identical, complete, read-only copy** of the trie — there's no sharding needed for reads, no replication lag to worry about, no leader/follower coordination, because nothing is being written live.
- **Scaling = add more stateless servers** behind the load balancer, each independently capable of answering any query — classic horizontal scaling (Part 2), simpler than usual because there's no shared mutable state to keep consistent across them.
- **Deploying a new trie snapshot** = rolling update — each server pulls/loads the new snapshot into memory and swaps over (e.g. atomic pointer swap from old structure to new), then the old one is garbage collected. No downtime, no coordination between servers required since each just needs a copy of the same file.
- If the vocabulary ever got too large for one machine's RAM, you'd shard the trie by first character/prefix range (`a-m` on one shard, `n-z` on another) — but at the estimated data size (tens of GB) this generally isn't necessary; it's the fallback, not the default.
- Async pipeline (Part 13/14) handles the log ingestion → aggregation → rebuild path entirely separately from the read-serving fleet, so a slow/failed rebuild never affects live query latency — servers just keep serving the last good snapshot.

---

<a name="arch"></a>
# 8. Full architecture

```
READ PATH (the hot path — optimize for this):
[User types] → debounce ~75ms → [CDN edge cache] (hot prefixes)
     │ miss
[Load Balancer] → [Stateless Suggestion Servers ×N — full trie snapshot in RAM]
     │ miss (rare)
[Redis] (hottest prefixes, extra cushion)
     → response: top-K precomputed at the matched node, O(prefix length) walk

WRITE / UPDATE PATH (offline, decoupled, low-throughput):
[Search query logs] → [Queue / log pipeline] → [Batch aggregation job, hourly/daily]
     → recompute frequencies (+ recency weighting)
     → rebuild trie + per-node top-K caches
     → publish immutable snapshot (versioned)
     → [Suggestion Servers] pull new snapshot, atomic swap, old one discarded
```

---

<a name="interview"></a>
# 9. Interview Q&A

### Q: "How would you design search autocomplete?"
> *"The core data structure is a trie so I can walk to a prefix's subtree in time proportional to the prefix length, not the vocabulary size. The key trick is caching the top-K most frequent completions at every node, not just leaves, computed ahead of time — so a query is just a prefix walk plus reading an already-ranked array, instead of scanning a potentially huge subtree at request time. The whole trie fits in memory, so each stateless server holds a full copy and there's no DB round-trip on the read path at all."*

### Q: "Why cache top-K at every node instead of computing it at query time?"
> *"Because for a popular prefix the matching subtree can hold millions of completions, and ranking that at request time, at the QPS this feature sees — basically every keystroke of every search — would blow the latency budget. Precomputing it during the offline build trades memory, which is cheap and the structure already fits in RAM, for query time, which is the scarce resource here. It turns every query into a constant-time lookup regardless of how popular the prefix is."*

### Q: "How do you keep the trie updated as trends change, without hurting read latency?"
> *"I don't update it live. Search logs are aggregated into frequency counts by an offline batch job, hourly or daily, which rebuilds the trie and its per-node top-K caches and publishes a new immutable snapshot. Suggestion servers pull that snapshot and swap to it — reads never contend with writes because from the server's perspective the structure is always read-only between rebuilds. That's a deliberate trade-off: suggestions can lag real-world trends by the batch interval, which is fine for a feature that just needs to be roughly right and very fast."*

### Q: "This is an extremely read-heavy system — how do you scale it?"
> *"Because the trie is read-only and small enough to fit in memory, I just replicate it identically across as many stateless servers as needed behind a load balancer — no sharding or replication coordination required, since nothing is being written live. That's simpler than scaling a normal database. If the vocabulary ever outgrew one machine's memory I'd shard by prefix range, but that's a fallback, not the default. On top I'd add Redis or CDN caching for the hottest single-character and two-character prefixes, which get disproportionate traffic."*

### Q: "What if a query is trending right now — does it wait for the next batch rebuild?"
> *"For most prefixes, yes, and that's an acceptable trade-off given how the feature is used. If genuinely real-time trending matters — a breaking news event, for example — I'd add a small separate 'trending overrides' structure that's updated much more frequently and merged with the base trie's results at query time, rather than rebuilding the entire multi-gigabyte trie on a tight cycle just to catch a handful of fast-moving terms."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

- **Shape:** extreme read:write ratio (10,000:1+) — every keystroke is a read; "writes" are an offline batch job, not live traffic.
- **Estimate:** ~52K QPS average / ~150-200K peak from keystroke-level requests; structure is only GBs-tens of GBs → fits in RAM.
- **Core:** trie for prefix lookup (O(prefix length)) + **top-K cached at every node** (not just leaves) to avoid a runtime subtree scan — trades memory for guaranteed-fast queries.
- **Build:** query logs → offline batch aggregation (hourly/daily) → rebuild trie + top-K caches → publish immutable snapshot → servers swap. Never updated live per-query.
- **Cache:** trie in-memory per server is itself the primary cache; optional Redis/CDN layer for the hottest prefixes; invalidation is trivial since updates are batched, not continuous.
- **Scale:** replicate the identical read-only trie across many stateless servers behind a LB — no sharding/replication coordination needed since nothing is written live; shard by prefix range only if data outgrows one machine.
- **Freshness trade-off:** suggestions lag by the batch interval; acceptable because "roughly right, always fast" beats "perfectly fresh, sometimes slow." Real-time trends handled via a small separate overrides layer if truly needed.

*— Design Problem 13 complete —*
