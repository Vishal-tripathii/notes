# Design Problem 19 — Ad Click Aggregation / Analytics Pipeline

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 13, 14, 21, 24, 27.
>
> **Signature challenge:** **stream aggregation with event-time correctness** — counting ~1M events/sec into per-minute windows when events arrive late and out of order, delivering sub-second dashboards, *and* producing a number accurate enough to bill an advertiser.
>
> **Why this problem is in the folder:** it's the only design here with the shape **"enormous write volume, approximate read."** Every other problem stores facts and reads them back. This one *throws the raw events away* and keeps aggregates — which makes the interesting questions "aggregate over what window, in whose clock, and how do you fix it when you're wrong."

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: event-time windowing & watermarks](#core)
5. [Exactly-once, and why it's really at-least-once + idempotence](#exactlyonce)
6. [Lambda vs Kappa — the fast path and the correct path](#lambdakappa)
7. [Approximate counting — HLL & friends](#approx)
8. [Database & storage](#db)
9. [Scaling — partitioning and the hot-key problem](#scaling)
10. [Full architecture](#arch)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Ingest ad **impression** and **click** events from browsers/apps worldwide.
2. Serve aggregated metrics — clicks, impressions, CTR, spend — sliced by **ad, campaign, advertiser, country, device**, over **time windows** (minute / hour / day).
3. Power a **near-real-time dashboard** an advertiser watches while a campaign runs.
4. Produce the **billing** number at the end of the period.
5. Detect and exclude **fraudulent / duplicate** clicks.

**Non-functional:**
- **Ingest must never drop events** — a dropped click is revenue that vanishes, and it's unrecoverable because the browser won't send it again.
- **Dashboard freshness: seconds.** An advertiser adjusting bids mid-campaign needs current numbers.
- **Billing accuracy: exact.** Advertisers audit their invoices.
- **Query latency: sub-second** over arbitrary slices and time ranges.
- **Massive write skew** — writes vastly exceed reads, and reads are aggregations, never point lookups.

> **The requirement tension that defines the design:** "dashboard in seconds" and "billing is exact" pull in opposite directions. Fast streaming aggregation makes assumptions about late data; exact billing can't. Resolving that tension is §6, and it's the heart of a strong answer.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume a large ad network:

- **Impressions:** ~100B/day → 100B ÷ 86,400 ≈ **~1.15M events/sec average**
- **Clicks:** CTR ~1% → ~1B/day ≈ **~11.5K/sec average**
- **Peak:** ~3× average → **~3.5M events/sec** at peak
- **Event size:** ~200 bytes (`adId`, `campaignId`, `userId`, `timestamp`, `country`, `device`, `dedupeId`)
- **Raw ingest volume:** 1.15M/s × 200B ≈ **~230 MB/s ≈ ~20TB/day** of raw events
- **Aggregated volume:** ~1M ads × ~1,440 minutes × ~50 bytes ≈ **~70GB/day** of per-minute aggregates — **~300× smaller than raw**
- **Query load:** low — thousands of dashboard users, not millions. **Reads are trivial in volume, expensive per query.**

> **The number that drives the design:** raw is ~20TB/day, aggregates are ~70GB/day. Aggregation compresses by **~300×**, which is why you never serve dashboards from raw events. But you **keep the raw** anyway (in cheap object storage) — because it's the only thing that lets you recompute when the pipeline was wrong, or answer a slice nobody pre-aggregated. **Aggregate for speed, retain raw for truth.**

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
# Ingest — extremely high volume, fire-and-forget shape
POST /api/v1/events
Body: { "eventType": "CLICK" | "IMPRESSION",
        "adId", "campaignId", "userId",
        "eventTs": 1756032000123,          ← when it happened ON THE CLIENT
        "dedupeId": "<uuid>",              ← client-generated, enables dedup
        "country", "device" }
→ 202 Accepted        ← 202, not 201: we've durably queued it, not processed it

# Query — low volume, heavy aggregation
GET /api/v1/metrics?campaignId=99&from=&to=&granularity=minute&groupBy=country
→ 200 { "series": [ { "ts", "country", "impressions", "clicks", "ctr", "spend" } ],
        "watermark": "2026-08-24T10:04:00Z",     ← how complete this data is
        "final": false }                          ← has batch reconciliation confirmed it?
```

**Four decisions worth defending:**

1. **`202 Accepted`, not `201 Created`.** The response means "durably queued," nothing more. Doing real work synchronously at 1M/s would couple ingest availability to the whole pipeline's health.
2. **`eventTs` is set by the client** — the moment the click actually happened. It will arrive at the server seconds or hours later. That gap *is* the core problem (§4).
3. **`dedupeId` is client-generated.** Same discipline as the idempotency key in [Problem 16](problem-16-payment-system-upi.md) — retries and at-least-once delivery mean the same click will be seen multiple times, and only a stable ID can collapse them.
4. **The query response exposes `watermark` and `final`.** This is unusual and it's the honest design: the API tells the caller *how complete* the answer is, rather than pretending a real-time number is settled. It's what lets a dashboard show "last 2 minutes still finalizing."

---

<a name="core"></a>
# 4. Core: event-time windowing & watermarks 🎯

### The problem: two different clocks

```
  Click happens on a phone in a tunnel        09:59:58   ← EVENT time
  Phone regains signal, event reaches Kafka   10:04:12   ← PROCESSING time
                                              ~4 min late
```

Which minute-bucket does this click belong to?

- **Processing time** (when we saw it) → bucket `10:04`. Easy to implement, and **wrong** — the 09:59 bucket under-counts forever, and the advertiser's "clicks per minute" chart is smeared and unreproducible. Reprocessing the same data gives different answers, because "when we saw it" depends on how fast the pipeline was running that day.
- **Event time** (when it happened) → bucket `09:59`. Correct, reproducible, and what the advertiser means. But it forces the question: **when is the 09:59 bucket done?** You can't emit it immediately, because more 09:59 events may still be in flight. And you can't wait forever.

> **Always aggregate on event time.** Processing-time windowing is the single most common wrong answer here. The tell that you understand it: *reprocessing the same input must produce the same output*, which is only true with event time.

### Watermarks — the answer to "when is a window done?"

A **watermark** is the stream processor's assertion: *"I believe I have seen all events with event-time ≤ T."*

```
 events arriving (by event time, out of order):
   09:59:12   09:59:47   10:00:03   09:59:58   10:00:31   09:59:20 ...
                                       ▲                      ▲
                                    in-order              4 min late

 watermark advances behind the newest event time, by a lag allowance:
   newest event time = 10:03:00,  allowed lateness = 2 min
   →  watermark = 10:01:00
   →  every window ending at or before 10:01 is CLOSED and emitted
```

**How the lag is chosen — the central trade-off:**

| Watermark lag | Effect |
|---|---|
| **Short** (seconds) | Fast dashboards, but more events arrive after their window closed → under-counting |
| **Long** (minutes) | More complete counts, but the dashboard lags by that much |

There's no correct value — it's a **product decision**, and stating it that way is the strong answer. In practice: **a short lag for the real-time path** (dashboards, seconds-fresh, explicitly approximate) and **a long lag or full batch recompute for the billing path** (§6).

### Handling events that arrive after the window closed

Three options, in increasing order of quality:

1. **Drop them.** Simple; systematically under-counts; unacceptable for billing.
2. **Allowed lateness + window update.** Keep the window's state around past the watermark for a grace period, and **emit a retraction/update** when a late event lands. The downstream store must support updating an already-written aggregate — which is why the sink matters (§8).
3. **Route to a side output** ("late events" stream) and let the batch layer fold them in (§6). This keeps the streaming path fast and simple while guaranteeing nothing is lost.

**In practice you do 2 and 3 together**: a modest grace period for the common small delays, and a side-channel plus batch reconciliation for the long tail.

> This is precisely why the API in §3 exposes `watermark` and `final`. The numbers for the last few minutes genuinely *are* provisional, and a design that hides that is lying to the advertiser.

---

<a name="exactlyonce"></a>
# 5. Exactly-once, and why it's really at-least-once + idempotence

An advertiser is billed per click. Counting a click twice is **overbilling**; missing one is **lost revenue**. So "exactly-once" is a genuine requirement — but as in [Problem 16 §4a](problem-16-payment-system-upi.md#core), it isn't a network guarantee. It's assembled from three separate pieces:

### ① Dedup at ingest
Clients retry; networks duplicate; the browser may fire the beacon twice. The `dedupeId` (§3) collapses them.
- At 1M/s you **cannot** keep every ID forever. Keep a **bounded-window dedup set** — say the last 10 minutes — since near-duplicates cluster tightly in time.
- A **Bloom filter (Part 27)** is a natural fit: tiny memory, no false negatives (never wrongly discards a genuine new click), and its false positives mean occasionally dropping a real duplicate-looking click. Combine with an exact check for candidates that the filter says it has seen, if you can't tolerate that loss.

### ② Exactly-once within the stream processor
Modern engines (Flink, Kafka Streams) provide this via **checkpointed state + transactional sinks**:
- The processor periodically **checkpoints** its window state (a consistent snapshot across all operators).
- On failure it **rewinds the source offsets** to the checkpoint and replays.
- Output is written **transactionally** — a two-phase commit against the sink, so partial output from a failed run is never visible.
- Net effect: replay after failure doesn't double-count, because the uncommitted output is discarded along with the rewound offsets.

### ③ Idempotent writes at the sink
Even with the above, make the final write idempotent — key aggregates by `(window_start, dimension_key)` and **upsert**. Then a replay that rewrites the same window produces the same row, not a second one.

> **How to say it:** "Exactly-once here is at-least-once delivery plus idempotent effects, assembled in three layers: a bounded dedup window at ingest for client-side duplicates, checkpointing with transactional sinks inside the stream processor for failure replay, and idempotent upserts keyed by window and dimension at the sink. And because none of that is airtight at 1M events/sec, billing is reconciled from the raw log by a batch job rather than trusted straight off the stream."

---

<a name="lambdakappa"></a>
# 6. Lambda vs Kappa — the fast path and the correct path

This is the architectural question the interviewer is actually probing, and it resolves §1's tension directly.

### Lambda architecture — two paths

```
                    ┌──▶ SPEED layer (stream) ──▶ approximate, seconds-fresh ──┐
  events ──▶ log ──┤                                                            ├──▶ serving
                    └──▶ BATCH layer (recompute from raw) ──▶ exact, hours-late ┘
                                                              (overwrites the approximate)
```
- **Speed layer:** Flink over Kafka, short watermark → dashboard numbers within seconds. Explicitly provisional.
- **Batch layer:** periodically **recomputes from the raw event log** in object storage, with no watermark pressure — every late event is present by then. Produces the **billing-grade** number and **overwrites** the streamed value.
- **Cost:** two codebases computing the same metric. They drift, and reconciling *that* becomes its own problem. This is Lambda's well-known and legitimate criticism.

### Kappa architecture — one path, replayable

```
  events ──▶ durable log (Kafka, long retention) ──▶ stream processor ──▶ serving
                              │
                              └── to correct: REPLAY the log through a new job version
```
- **One** processing path. Correction is achieved by **replaying** the retained log — either through the same job with a longer watermark, or through a new version of the job written to a new output table which is then swapped in.
- Requires the log to retain enough history (or to be backed by object storage) to replay a full billing period.
- **Advantage:** one codebase, one set of semantics, no drift.

### The answer to give

> *"I'd run Kappa as the default — one codebase, and correction by replaying the retained log — because Lambda's real cost isn't compute, it's maintaining two implementations of the same metric that inevitably disagree. But I'd keep the **raw events in cheap object storage regardless**, because that's what makes replay possible at all, and I'd run a scheduled **reconciliation job** that recomputes the billing period from raw with a generous lateness allowance and marks those aggregates final. Functionally that reconciliation is Lambda's batch layer — the difference is that it runs the same logic over the same log rather than being a second implementation. Dashboards read the provisional streamed numbers with a freshness indicator; billing reads only rows marked final."*

That answer is strong because it takes a position, names the real cost of the alternative, and explains that the batch/stream split here is about **when** you compute, not **two different ways** to compute.

---

<a name="approx"></a>
# 7. Approximate counting — HLL & friends *(Part 27)*

Some metrics are exact by nature; some are prohibitively expensive to make exact. Knowing which is which is a differentiator.

| Metric | Exact? | Structure |
|---|---|---|
| **Click count, impressions, spend** | **Exact — required.** These are billed. | Plain counters, reconciled from raw |
| **Unique users reached** | Approximate is fine | **HyperLogLog** |
| **Top-K ads by clicks** | Approximate is fine | Count-Min Sketch + heap |
| **Has this user seen this ad?** (frequency capping) | Approximate, must not have false negatives | **Bloom filter (Part 27)** |

**HyperLogLog for unique reach:** counting distinct users exactly means holding every user ID seen — at billions of events, that's enormous, *and it doesn't merge*. HLL estimates cardinality in **~12KB per counter with ~2% error**, and critically it is **mergeable**: `HLL(a) ∪ HLL(b)` gives the union's cardinality. That's what lets you store one sketch per (ad, minute) and answer "unique users for this campaign last week" by merging 10,080 sketches — impossible with raw sets, trivial with HLL.

> **The rule to state:** "Anything that appears on an invoice is exact and reconciled from the raw log. Anything descriptive — unique reach, top-K, frequency capping — uses a sketch, because a 2% error on 'unique users' is invisible to the advertiser while the memory saving is four or five orders of magnitude."

---

<a name="db"></a>
# 8. Database & storage *(Part 8)*

| Data | Pattern | Store |
|---|---|---|
| **Raw event log** | ~1.15M writes/s, append-only, replayed occasionally | **Kafka** (hot, days) → **object storage as Parquet** (cold, years). Partitioned by date/hour. |
| **In-flight window state** | Read-modify-write per event, must survive failure | Stream processor's **checkpointed state backend** (RocksDB + snapshots to object storage) |
| **Hot aggregates** (dashboard) | Sub-second slice-and-dice over recent data | **Columnar OLAP — Druid or ClickHouse** |
| **Cold aggregates** (historical, billing) | Large scans, cheap storage, infrequent | Object storage (Parquet) + a query engine |
| **Dedup set** | 1M lookups/s, bounded window | Redis / in-process **Bloom filter** (Part 27) |

**Why a columnar OLAP store and not a relational database:** dashboard queries are `SUM(clicks) GROUP BY country WHERE campaign=99 AND ts BETWEEN ...` — they touch **few columns across enormous row counts**. Columnar layout reads only the needed columns, compresses them heavily (adjacent values in a column are similar), and vectorizes the aggregation. A row store must read every full row. This is a genuine order-of-magnitude difference, and it's the reason a separate analytics store exists at all rather than adding an index to the transactional database.

**Rollups (essential, not an optimization):** store per-minute aggregates for recent data, then **roll up** to hourly after a few days and daily after a few months. Nobody queries minute-granularity from eight months ago, and keeping it makes every long-range query scan 1,440× more rows than necessary. Rollup is what keeps historical queries fast *and* storage bounded.

**Pre-aggregate the common dimension combinations, don't try to pre-aggregate all of them.** With ~5 dimensions the full cube is 2⁵ combinations per time bucket — and it explodes exponentially with each dimension added. Pre-compute the handful the dashboard actually uses; let the OLAP engine compute the rest on the fly, which it's built to do.

---

<a name="scaling"></a>
# 9. Scaling — partitioning and the hot-key problem *(Parts 21, 24)*

**Partition the event stream by `adId`** (or `campaignId`). Aggregation is a `GROUP BY` on that key, so co-locating all events for one ad on one partition means **each aggregator owns its keys entirely** — no cross-partition coordination, no distributed state, no shuffling per event. Kafka's ordering guarantee is per-partition, which is exactly what windowed aggregation needs.

### The hot-key problem (the interesting failure)

Ad traffic is **extremely skewed** — a Super Bowl campaign can be a large fraction of all traffic. Partitioning by `adId` sends all of it to **one** partition and **one** aggregator, which becomes the bottleneck while its peers idle. Adding partitions doesn't help: the key still hashes to one of them.

**The fix — two-phase aggregation (key salting):**

```
 Phase 1: partition by (adId + random salt 0..N)
          → traffic for the hot ad spreads across N partitions
          → each computes a PARTIAL count for its (ad, window, salt)

 Phase 2: partition by adId only
          → merge the N partials into the final count for (ad, window)
```

Phase 2 handles **N values per window instead of millions of events** — a trivially small volume. This works because **count is associative and commutative**: partial sums can be computed independently and merged in any order.

> **Say the general principle:** "This works for any associative aggregation — sums, counts, min/max, and HLL sketches, which merge by design. It does *not* work for order-dependent computations, so if I needed something like an exact median I'd need a different approach — usually a sketch that *is* mergeable, like t-digest."

**Other scaling points:**
- **Ingest is stateless** — pure HTTP endpoints that validate and write to Kafka. Scale horizontally behind a load balancer; a `202` response means no ingest node holds state and any node can serve any request.
- **Regional ingest, central aggregation.** Terminate the write close to the user (latency, Part 3), then forward to a central pipeline — or aggregate regionally and merge globally, which is the same two-phase pattern applied geographically.
- **Backpressure, don't drop** (Part 13). Kafka is the shock absorber: if the aggregator falls behind, lag grows and it catches up. Events are never lost because the log is durable — the whole reason for putting a log between ingest and processing.
- **Consumer lag is the primary health metric.** Growing lag is the earliest signal the pipeline is failing, well before any dashboard looks wrong.

---

<a name="arch"></a>
# 10. Full architecture

```
 [Browser / Mobile SDK]  ── click/impression beacon (eventTs, dedupeId) ──┐
                                                                          ▼
                                    [ Regional Ingest Service — stateless, 202 ]
                                                     │
                                                     ▼
                               ┌──────────────────────────────────────┐
                               │   KAFKA — durable log, partitioned    │
                               │   by (adId + salt), days of retention │
                               └──────────────────────────────────────┘
                                     │                            │
                    ┌────────────────┘                            └────────────┐
                    ▼                                                          ▼
        [ DEDUP  — Bloom filter,                                   [ Archiver → OBJECT STORAGE ]
          bounded ~10 min window ]                                   raw Parquet, partitioned
                    │                                                by date/hour, years
                    ▼                                                          │
   ┌────────────────────────────────────────┐                                  │
   │  STREAM PROCESSOR (Flink)              │                                  │
   │  • EVENT-TIME windows + watermarks     │                                  │
   │  • phase 1: partial agg (salted key)   │                                  │
   │  • phase 2: merge by adId              │                                  │
   │  • checkpointed state, txn sink        │                                  │
   │  • late events → side output ──────────┼──────────────────┐               │
   └────────────────────────────────────────┘                  │               │
                    │ idempotent upsert                        │               │
                    │ key = (window_start, dims)               ▼               ▼
                    ▼                                  ┌────────────────────────────┐
      ┌──────────────────────────────┐                 │  RECONCILIATION JOB         │
      │ HOT STORE — Druid/ClickHouse │ ◀───overwrite───│  recompute period from RAW  │
      │ per-minute, columnar         │   marks final    │  generous lateness allowance│
      │ rollup → hourly → daily      │                 └────────────────────────────┘
      └──────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
 [Dashboard API]          [Billing API]
  provisional,             reads ONLY rows
  exposes watermark        marked final
```

**Write path:** beacon → stateless ingest → `202` → Kafka (durable, the shock absorber) → dedup → event-time windowed aggregation with watermarks → idempotent upsert into columnar OLAP. In parallel, every raw event is archived to object storage.
**Correction path:** reconciliation replays raw for the period with generous lateness, overwrites the aggregates, marks them `final`.
**Read path:** dashboards read hot aggregates (fast, provisional, `watermark` exposed); billing reads only `final`.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "A click happens at 09:59:58 but arrives at 10:04. Which minute does it count in?"
> *"09:59 — the event time, not the processing time. Processing-time windowing is the common wrong answer: it's easy to implement but the numbers aren't reproducible, because 'when we saw it' depends on how fast the pipeline was running that day, so replaying the same input gives a different answer. Event time is what the advertiser means and it's deterministic. The cost is that I now have to decide when a window is complete, which is what watermarks are for — the processor asserts it has seen everything up to time T, lagging behind the newest event by an allowance, and closes windows behind that. A short lag means fresher dashboards but more under-counting; a long lag means the opposite. That's a product decision, not a technical one, so I'd run a short lag for dashboards and let batch reconciliation handle billing."*

### Q: "What happens to events that arrive after their window already closed?"
> *"Three options, and I'd use two of them together. Dropping them is simple but systematically under-counts, which is unacceptable when the number gets billed. So first I keep the window state alive for a grace period past the watermark and emit an update when a late event lands — which requires a sink that supports updating an already-written aggregate, so I key by window and dimension and upsert. Then for the long tail beyond the grace period, I route them to a side output and let the reconciliation job fold them in when it recomputes from the raw log. That's also why my query API exposes a watermark and a 'final' flag — the last few minutes genuinely are provisional, and hiding that would be lying to the advertiser."*

### Q: "Lambda or Kappa?"
> *"Kappa as the default, because Lambda's real cost isn't compute — it's maintaining two implementations of the same metric, which drift, and then reconciling the drift becomes its own problem. With Kappa there's one processing path and correction happens by replaying the retained log. But I'd keep raw events in cheap object storage regardless, since that's what makes replay possible, and I'd run a scheduled reconciliation that recomputes the billing period from raw with a generous lateness allowance and marks those aggregates final. Functionally that's Lambda's batch layer — the difference is it's the same logic over the same log, not a second implementation. Dashboards read the provisional streamed numbers with a freshness indicator; billing reads only rows marked final."*

### Q: "One campaign is ten percent of all your traffic. Your partition for it melts. Fix it."
> *"That's a hot-key problem, and adding partitions doesn't help because the key still hashes to one of them. The fix is two-phase aggregation with key salting. In phase one I partition by ad ID plus a random salt from zero to N, so the hot ad's traffic spreads across N partitions, each computing a partial count for its ad-window-salt combination. In phase two I repartition by ad ID alone and merge those partials into the final count. Phase two only handles N values per window instead of millions of events, so it's trivially small. This works because count is associative and commutative — partial sums merge in any order. The same trick covers sums, min, max, and HLL sketches, which merge by design. It would not work for something order-dependent like an exact median, where I'd need a mergeable sketch such as t-digest instead."*

### Q: "How do you guarantee exactly-once when the advertiser is billed per click?"
> *"Exactly-once isn't a network guarantee — it's at-least-once delivery plus idempotent effects, and I build it in three layers. At ingest, clients and browsers duplicate, so every event carries a client-generated dedupe ID and I keep a bounded dedup window of about ten minutes, since near-duplicates cluster tightly in time. A Bloom filter suits that — tiny memory, no false negatives. Inside the stream processor, exactly-once comes from checkpointed state plus transactional sinks: on failure it rewinds source offsets to the last checkpoint and replays, and uncommitted output is discarded, so replay doesn't double-count. At the sink, aggregates are keyed by window start and dimension and written as upserts, so a rewrite of the same window produces the same row. And because none of that is airtight at a million events a second, billing is reconciled from the raw log by a batch job rather than trusted straight off the stream."*

### Q: "Why not just store every event and query it directly?"
> *"Twenty terabytes a day of raw events versus about seventy gigabytes of aggregates — three hundred times smaller — and a dashboard query would have to scan billions of rows to answer 'clicks per minute for this campaign.' So I aggregate for serving. But I keep the raw in cheap object storage anyway, for two reasons: it's the only thing that lets me recompute when the pipeline was wrong or the logic changes, and it's the only way to answer a slice nobody pre-aggregated. Aggregate for speed, retain raw for truth. On the serving side I use a columnar store rather than a relational one, because these queries touch few columns across enormous row counts — columnar reads only those columns, compresses them heavily since adjacent values are similar, and vectorizes the aggregation, which is an order of magnitude difference, not a tuning detail."*

### Q: "How do you count unique users reached?"
> *"With HyperLogLog, not exactly. Counting distinct users exactly means holding every user ID you've seen, which at billions of events is enormous and — more importantly — doesn't merge, so you can't combine per-minute results into a weekly answer. HLL estimates cardinality in around twelve kilobytes with roughly two percent error, and it's mergeable by construction, so I store one sketch per ad per minute and answer 'unique users this week' by merging ten thousand sketches. The rule I'd apply generally: anything that appears on an invoice is exact and reconciled from raw; anything descriptive — unique reach, top-K, frequency capping — uses a sketch, because two percent error on unique users is invisible to the advertiser while the memory saving is four or five orders of magnitude."*

### Q: "Your aggregator falls behind during a traffic spike. What breaks?"
> *"Nothing loses data, which is the point of putting a durable log between ingest and processing. Ingest is stateless and just writes to Kafka and returns 202, so it stays healthy independently. If the aggregator can't keep up, consumer lag grows and the dashboard gets staler — degraded, not broken — and it catches up when the spike passes. Consumer lag is my primary health metric precisely because it's the earliest signal, well before any dashboard number looks wrong. What I explicitly don't do is shed events under pressure: a dropped click is revenue that vanished and the browser will never send it again, so I take backpressure and latency instead."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

- **Shape:** the only **"enormous write, approximate read"** problem in the folder. Raw events are thrown away for serving but **retained for truth**.
- **Estimate:** ~1.15M events/s avg (~3.5M peak), ~20TB/day raw vs **~70GB/day aggregates (~300× compression)**. Reads are few but expensive.
- **Core — event time, never processing time.** Processing-time windowing isn't reproducible; replaying gives different answers. Event time is what the advertiser means.
- **Watermark** = "I've seen everything up to T," lagging the newest event. **Short lag = fresh but under-counts; long lag = complete but stale.** Product decision. Short for dashboards, batch recompute for billing.
- **Late events:** grace period + window update (needs upsert-capable sink) **and** side output → batch reconciliation. API exposes `watermark` + `final` — don't pretend provisional numbers are settled.
- **Exactly-once = at-least-once + idempotence, in 3 layers:** ① `dedupeId` + bounded dedup window (Bloom filter, Part 27) ② checkpointed state + transactional sink (rewind offsets, discard uncommitted output) ③ idempotent upsert keyed by `(window_start, dims)`. Billing reconciled from raw regardless.
- **Lambda vs Kappa:** take a position — **Kappa** (one codebase, correct by replay), keep raw in object storage, plus a scheduled reconciliation that marks aggregates `final`. Lambda's real cost is two implementations that drift.
- **Approximate where it's free:** exact for anything billed; **HyperLogLog** for unique reach (~12KB, ~2% error, **mergeable** — that's the point); Count-Min Sketch for top-K; **Bloom filter** for frequency capping.
- **Storage:** Kafka (hot log) → object storage Parquet (cold, years); **columnar OLAP** (Druid/ClickHouse) for serving — few columns, huge row counts, compresses and vectorizes. **Rollup** minute → hour → day. Pre-aggregate only the common dimension combos; the full cube is 2^d and explodes.
- **Scale:** partition by `adId` so each aggregator owns its keys. **Hot key → two-phase aggregation with salting:** phase 1 partial by `(adId+salt)`, phase 2 merge by `adId`. Works for **associative** aggregations (sum/count/min/max/HLL), not order-dependent ones.
- **Ingest is stateless + `202`;** Kafka is the shock absorber; **backpressure, never drop** (a lost click is unrecoverable revenue). **Consumer lag = primary health metric.**
- **Cross-refs:** **Part 13.5** (ordering/partition keys, consumer groups & the scaling ceiling, consumer lag, exactly-once), Part 13/14 (log, queues, event-driven), Part 27 (Bloom filter — reused for dedup and frequency capping), Part 24 (partitioning/consistent hashing), Problem 16 (idempotency-key discipline + reconciliation, same spine).

*— Design Problem 19 complete —*
