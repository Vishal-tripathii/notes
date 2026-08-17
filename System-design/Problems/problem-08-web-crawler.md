# Design Problem 08 — Web Crawler

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 21, 24, 13. Signature challenge: politeness (don't hammer one domain) + dedup at massive scale via a distributed frontier queue.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: the frontier queue + politeness](#core)
5. [Dedup at scale](#dedup)
6. [Distributed crawling](#distributed)
7. [Database](#db)
8. [Scaling](#scaling)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Given a set of **seed URLs**, crawl each page.
2. **Extract links** from the page and follow them (recursive discovery).
3. **Avoid re-crawling** the same URL repeatedly (dedup) — but allow periodic re-crawl for freshness.
4. **Respect `robots.txt`** and per-domain **rate limits** — don't hammer any one site.

**Non-functional:**
- **Massive scale** — the web is billions of pages; the crawler must scale horizontally, not just fast on one machine.
- **Politeness is non-negotiable** — an impolite crawler gets IP-banned and can be treated as a DoS attack. This constraint shapes the whole design more than raw throughput does.
- **Fault tolerant** — one crawler worker dying shouldn't lose in-flight frontier state.
- **Extensible** — new content types (HTML now, maybe PDFs/images later) shouldn't require a redesign.
- Freshness is a soft goal, not hard real-time — pages can be re-crawled on a schedule (daily/weekly) rather than needing instant updates.

> Write-heavy discovery graph + a hard external constraint (politeness) → **the frontier queue's partitioning strategy is the whole design, not caching or reads.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume a target of crawling **1 billion pages/month**, average page size ~500KB (with embedded resources counted separately/skipped).

- **Pages/sec target:** 1B ÷ (30×24×3600) ≈ **~400 pages/s** sustained average (bursty in practice, provision higher).
- **URL frontier size:** each crawled page yields ~outgoing links; the *discovered-but-not-yet-crawled* frontier can balloon to **billions of URLs** even if only crawling 1B/month — the graph of "known URLs" grows faster than the "crawled URLs" count.
- **Seen-URL set:** to dedup against, need a structure covering **tens of billions of URLs** over the crawl's lifetime — a plain hash set of URLs (avg ~70-100 bytes each) at 10B URLs ≈ **~1TB just for the dedup set** if stored naively → this is why a Bloom filter matters (see Dedup section).
- **Storage (crawled pages):** 1B pages/month × 500KB ≈ **~500 PB/month** if storing raw HTML forever — in practice, compress, dedup identical content, and often store only extracted text/metadata rather than raw bytes for most pages.
- **Bandwidth:** ~400 pages/s × 500KB ≈ **~200 MB/s** sustained outbound fetch bandwidth.

> Key number to say out loud: *"The frontier and the seen-set are the scale problem — not serving reads. Billions of URLs, and most of the design exists to keep that queue polite and non-duplicated."*

---

<a name="api"></a>
# 3. API Design *(Part 11)*

Mostly an internal, backend-only system — no public-facing API surface to design in depth. Worth stating briefly:

```
POST /internal/crawl/seed
Body: { "urls": ["https://example.com", ...] }
→ 202 Accepted   (seeds pushed onto the frontier queue)

GET /internal/crawl/status?domain=example.com
→ { "crawled": 4213, "queued": 891, "lastCrawledAt": "..." }
```

- Seeding is the only real "write" API — everything past that is internal worker-to-queue-to-storage flow, not client-facing request/response.
- A status/admin API is useful operationally (see what's queued per domain, pause a misbehaving domain) but isn't where the design complexity lives — keep this section brief and move to the core.

---

<a name="core"></a>
# 4. Core: the frontier queue + politeness 🎯

The signature challenge: crawl billions of URLs **without ever exceeding a per-domain rate limit**, using a **priority queue of URLs to crawl** — the **frontier**.

### The key insight: partition the frontier BY DOMAIN, not randomly

```
❌ Random/round-robin partitioning:
Queue shard 1: [example.com/a, other.com/x, example.com/b, third.com/y, ...]
Queue shard 2: [example.com/c, other.com/z, example.com/d, ...]
→ URLs for example.com are scattered across every shard → no single point
  enforces "max N requests/sec to example.com" → workers independently
  hammer the same domain from different shards → politeness violated.

✅ Partition by DOMAIN:
Queue shard "example.com": [ /a, /b, /c, /d, ... ]   ← ALL example.com URLs, one place
Queue shard "other.com":   [ /x, /y, /z, ... ]
→ One queue (and the worker(s) draining it) owns ALL URLs for a domain
  → rate limiting is now a LOCAL, single-point decision: "have I sent a
    request to example.com in the last N ms? if not, dequeue next; else wait."
```

**Why this is the key insight:** politeness is fundamentally a **per-domain** constraint ("no more than 1 request/sec to `example.com`"), so the only way to enforce it *without expensive cross-shard coordination* is to make sure **all URLs belonging to that domain flow through the same queue/worker**. This turns a distributed rate-limiting problem (which would need a shared counter, coordination, locks) into a **local** one (a single worker just checks its own last-fetch timestamp for that domain). Same principle as "shard by the thing you need to serialize on."

**Frontier is also a priority queue, not FIFO:**
- Higher-priority URLs (e.g. known high-PageRank pages, or pages due for freshness re-crawl) get dequeued first.
- Each domain-partition maintains its own internal priority ordering plus a **politeness delay timer** (don't dequeue the next URL for this domain until `robots.txt`'s crawl-delay, or a default like 1s, has elapsed since the last fetch).
- Before fetching, check the domain's cached `robots.txt` rules (fetched and cached once per domain, refreshed periodically) — skip disallowed paths entirely, never even enqueue them.

---

<a name="dedup"></a>
# 5. Dedup at scale — Bloom filter *(full mechanics: Part 27)*

**The problem:** "have we seen this URL before?" needs to be answered on every one of billions of discovered links, and a naive hash set of full URL strings at that scale costs **~1TB+** of memory/storage (see estimation) — too expensive to keep fully in fast memory across a distributed fleet.

**Fix: a Bloom filter.**
- A Bloom filter is a compact bit-array + several hash functions. To check membership, hash the URL K times, check if all K bit positions are set.
- **Massive space savings:** a Bloom filter can represent "have we seen ~1 billion URLs" in a fraction of a GB (vs hundreds of GB+ for a hash set), because it doesn't store the actual URLs — just a probabilistic bit pattern.
- **The trade-off:** Bloom filters can give **false positives** ("says seen, but wasn't actually" — due to hash collisions in the bit array) but **never false negatives** ("says not-seen" is always correct).

**Why the false-positive-only guarantee is an acceptable trade-off here:** the cost of a false positive is *skipping a URL we actually hadn't crawled yet* — a missed page, which is a minor completeness loss the crawler can tolerate (the web is huge; missing a small percentage of low-priority pages doesn't materially hurt). The cost of a false negative would be *re-crawling a URL we already saw*, which the Bloom filter structurally cannot produce. Given that trade-off — "occasionally slightly incomplete" vs "occasionally wastefully duplicate work, at 1000x the memory cost" — the Bloom filter wins decisively for a system whose bottleneck is memory/storage at billion-URL scale, not perfect completeness.
- Tune the false-positive rate by sizing the bit array and number of hash functions — more bits = lower false-positive rate at proportionally more memory, still orders of magnitude cheaper than a hash set.

---

<a name="distributed"></a>
# 6. Distributed crawling — consistent hashing *(Part 24)*

With potentially thousands of crawler worker machines, **who owns which domain's queue?**

- Use **consistent hashing** on the domain name to assign each domain to a specific crawler worker (or small set of workers).
- `hash(domain) → position on the hash ring → owning worker`.
- **Why this matters for politeness specifically:** the whole per-domain rate-limit trick from the Core section only works if the *same worker* consistently handles a given domain's queue over time — otherwise politeness state (last-fetch timestamp, current rate budget) would need to be shared/coordinated across workers, reintroducing the distributed-coordination problem consistent hashing lets us avoid.
- **Why consistent hashing over plain `hash(domain) % N`:** when workers are added or removed (scaling up for a crawl push, or a worker dying), plain modulo hashing remaps a huge fraction of domains to different workers all at once — which would momentarily break politeness guarantees (new owner has no memory of the last fetch time) and cause a thundering-herd re-fetch pattern. Consistent hashing only remaps the ~`1/N` slice of domains that were near the changed node on the ring, keeping ownership — and thus politeness state — stable for the vast majority of domains.
- Combine with **virtual nodes** so a few very large/high-volume domains (e.g. a huge e-commerce site) don't get pinned to one physical worker and become a hotspot — virtual nodes spread a busy logical domain's ring presence and let its queue depth get replicated/balanced more evenly, though the domain's actual fetch-serialization for rate-limiting still needs a single coordinating point (e.g. a leader worker or a domain-local token bucket in a fast shared store).
- Net effect: **no central coordinator needed** to decide "which worker crawls example.com right now" — every worker can compute the ring assignment independently and consistently.

---

<a name="db"></a>
# 7. Database *(Part 8)*

Two very different storage needs:

**Crawled page storage** (huge, write-once-ish, read for indexing/processing later):
```
urlHash(PK) | url | fetchedAt | httpStatus | contentHash | rawContent/blobRef | extractedLinks
```
- **Blob storage** (S3-like) for raw HTML/content — cheap at petabyte scale, not a database's job to hold large blobs.
- A **NoSQL** metadata store (key-value, keyed by URL hash) tracks fetch status, timestamps, and a pointer (`blobRef`) into blob storage — no joins needed, simple key lookups, shards naturally by URL hash.
- `contentHash` (hash of page body) enables **duplicate-content detection** distinct from duplicate-URL detection — two different URLs can serve identical content (mirrors, tracking params), and dedupe/skip re-processing identical content.

**URL frontier persistence:**
```
domain(PK/shard key) | url | priority | discoveredAt | status(queued/in-progress/done)
```
- Backed by a **durable queue** (Kafka-style partitioned log, or a distributed queue service) partitioned **by domain** — matching the Core-section partitioning decision — so it survives worker crashes: an in-progress URL not acked within a timeout gets redelivered rather than lost.
- Frontier is inherently ephemeral/working-set data (versus the crawled-page store which is the durable output), so it can tolerate a leaner, faster backing store than the page archive.

---

<a name="scaling"></a>
# 8. Scaling

- **Horizontal worker scaling** — add more crawler workers; consistent hashing reassigns only a thin slice of domains, keeping the rest of the fleet's politeness state intact.
- **Domain-level parallelism, not just machine-level** — many small/medium domains can be crawled fully in parallel across different workers (each respecting its own rate limit) since the domain-partitioned queues are independent of each other; this is where most of the raw throughput comes from, not from crawling one domain faster.
- **Async pipeline stages** (Part 13) — fetch → parse/extract-links → dedup-check → enqueue-new-links should be decoupled stages (queue between them), so a slow parser doesn't block fetch throughput, and a burst of newly discovered links doesn't stall the fetchers.
- **robots.txt + rate-limit cache** — cache per-domain robots rules and current rate-limit budget in a fast store local to (or replicated per) the owning worker, refreshed periodically, so it's not re-fetched on every URL.
- **Re-crawl scheduling** — treat freshness as a lower-priority, recurring re-injection into the frontier (e.g. a scheduled job re-adds "due for re-crawl" URLs at low priority) rather than a separate system.
- **Bottleneck to name:** for any single very-high-volume domain, the per-domain rate limit is an intentional ceiling — you cannot "scale around" politeness for one domain by adding more workers, since only the owning worker(s) may fetch from it. The fix there is being patient (spread over more time), not more compute.

---

<a name="arch"></a>
# 9. Full architecture

```
[Seed URLs] ──POST /internal/crawl/seed──> [Frontier Ingest]
                                                    │
                                    hash(domain) via consistent hashing ring
                                                    │
                        ┌───────────────────────────┼───────────────────────────┐
                        ▼                            ▼                           ▼
             [Frontier shard: domain A]    [Frontier shard: domain B]  [Frontier shard: domain C]
             (priority queue + politeness      ...owned by a consistently-assigned worker...
              delay timer + robots.txt cache)
                        │
             [Crawler Worker for domain A]  ← enforces "1 req/Ns" locally, no coordination needed
                        │  fetch page
                        ▼
             [Parser: extract links + content]
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
   [Bloom filter: seen URL?]   [Page store: blob (S3) + metadata (NoSQL, urlHash key)]
             │  not seen
             ▼
   [Enqueue new URL onto its domain's frontier shard]  (via consistent-hash routing)
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "Why partition the frontier queue by domain instead of randomly?"
> *"Politeness is fundamentally a per-domain constraint — no more than N requests per second to a given site. If URLs for one domain are scattered across random shards, enforcing that limit means coordinating across shards, which is expensive and race-condition-prone. Partitioning by domain means every URL for a site flows through one queue owned by one worker, so the rate limit becomes a local check — 'did I fetch from this domain recently?' — with no coordination needed at all."*

### Q: "Why use a Bloom filter instead of a hash set for dedup?"
> *"At billions of URLs, a hash set storing full URL strings costs on the order of a terabyte or more. A Bloom filter represents the same 'have we seen this' check in a fraction of that space because it stores a bit pattern, not the actual URLs. The trade-off is it can false-positive — occasionally say 'seen' for a URL we haven't actually crawled — but it never false-negatives. A false positive just means we skip a page we could've crawled, which is a tolerable, minor completeness loss on a web-scale crawl. A false negative would mean wasted duplicate crawling, which the Bloom filter structurally can't produce. Given the memory savings are 1000x or more, that trade-off is an easy accept."*

### Q: "How do you distribute crawling across many workers while keeping politeness guarantees?"
> *"Consistent hashing on the domain name assigns each domain to a worker, and critically, that assignment stays stable as workers are added or removed — only a thin slice of domains gets remapped, not all of them. That stability matters because the per-domain rate-limit state (last fetch time, current budget) lives with whichever worker owns that domain. If ownership churned on every scaling event, we'd lose that state and either violate politeness or need shared coordination — consistent hashing avoids both."*

### Q: "What happens to a URL if the worker crawling it crashes mid-fetch?"
> *"The frontier is backed by a durable, partitioned queue — think Kafka-style — so an in-progress URL that isn't acknowledged within a timeout gets redelivered, typically to whichever worker now owns that domain per the hash ring. We don't lose frontier state on a crash; we just get an at-least-once redelivery, and the Bloom filter/dedup check plus content hashing keep a redundant re-fetch from causing wasted downstream processing."*

### Q: "How would you prioritize what to crawl first?"
> *"The frontier isn't strict FIFO — it's a priority queue. Higher-signal pages, like ones with high inbound link counts, or URLs that are due for a freshness re-crawl, get dequeued ahead of freshly discovered low-priority links. Re-crawl scheduling is handled by periodically re-injecting 'due' URLs into the frontier at an appropriate priority rather than running a separate system for it."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** write-heavy discovery graph at massive scale; politeness is the binding constraint, not raw throughput.
- **Estimate:** ~400 pages/s sustained, frontier can hit billions of URLs, seen-set naive hash set ≈ ~1TB — hence Bloom filter.
- **Core:** frontier = priority queue **partitioned by domain** → per-domain rate limiting becomes a local check, not distributed coordination.
- **Dedup:** Bloom filter — false positives only (skip a page, tolerable), never false negatives (never re-crawl-duplicate), massive space savings vs a hash set.
- **Distributed:** consistent hashing assigns domains to workers; stable ownership across scaling events keeps politeness state intact with no central coordinator.
- **DB:** blob storage for raw pages + NoSQL metadata (urlHash key); durable partitioned queue for frontier persistence, partitioned by domain.
- **Scale:** horizontal workers (thin remap via consistent hashing), domain-level parallelism, async pipeline stages (fetch/parse/dedup/enqueue), cached robots.txt + rate budgets.
- **Bottleneck to name:** one domain's rate limit is a hard ceiling — can't scale around it with more compute, only with more time.

*— Design Problem 08 complete —*
