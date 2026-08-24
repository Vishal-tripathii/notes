# Design Problem 11 — Video Streaming (YouTube / Netflix)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 02.7, 20, 21. **Signature challenge:** chunked upload + transcoding pipeline, and adaptive-bitrate delivery via CDN.
>
> **One file, both products.** §1–8 are the **shared spine** — identical whether the prompt says YouTube or Netflix. **[§8.5](#divergence)** is the fork: where the two designs genuinely diverge (unbounded UGC ingest vs curated catalog, reactive vs proactive caching, Open Connect), plus the **live streaming** variant. Read §8.5 before any interview where the prompt names one of them specifically.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: transcoding pipeline](#core)
5. [Adaptive bitrate streaming, explained](#abr)
6. [Database](#db)
7. [Storage + CDN](#cdn)
8. [Scaling](#scaling)
8.5. [**YouTube vs Netflix — where the designs diverge**](#divergence)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Upload a video.
2. Transcode it into multiple resolutions/bitrates (240p → 4K).
3. Stream playback with **adaptive quality** — the player switches resolution based on network conditions.
4. *(Out of scope-ish)* view counts, recommendations, search — real systems have these, but they're separate subsystems layered on top; this design focuses on ingest and delivery.

**Non-functional:**
- **Massive asymmetry between write and read cost** — a video is transcoded once but streamed millions of times.
- **High availability for playback** — a stalled video is a broken product; uploads can tolerate more latency.
- **Elastic, bursty compute** — transcoding load spikes right after upload bursts, unlike steady API traffic.
- **Global low latency** — viewers are everywhere; playback must feel local.

> One-time write cost + massively repeated read cost + huge payload sizes → **this is fundamentally a bandwidth-and-pipeline problem, not a QPS problem.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

**Uploads (using the classic industry order-of-magnitude: ~500 hours of video uploaded per minute):**
- 500 hrs/min × 60 × 24 ≈ **720,000 hours of raw video/day**.
- At ~1GB/hour of raw source ≈ **~720 TB/day** ingested.
- Avg video length ~10 min → uploads/day = 720,000hr × 60 ÷ 10 ≈ **4.3M videos/day** → ÷86,400 ≈ **~50 uploads/s** avg (bursty, higher at peak).

**Storage (transcoding multiplies it, but it's still the smaller number):**
- Each video stored as a master + ~5 renditions (240p/480p/720p/1080p/4K) + HLS/DASH segment overhead ≈ **~2× the raw source size** once all renditions exist.
- ~720TB/day raw × 2 ≈ **~1.4 PB/day** stored → **~500 PB/year**. Large, but it's a one-time cost per video.

**Bandwidth (the number that actually dominates):**
- Assume ~1B video views/day platform-wide.
- A 10-min video streamed at adaptive ~2Mbps average ≈ **~150MB transferred per view**.
- 1B views × 150MB ≈ **~150 PB/day of egress** — roughly **100× the daily storage growth**.
- Per second: 150PB ÷ 86,400s ≈ **~1.7 GB/s ≈ ~14 Tbps sustained**.

> **Storage is a one-time cost per video; bandwidth is paid on every single view, forever.** That's why bandwidth — not storage — is the number that shapes this entire architecture, and why the CDN section below is the real center of gravity.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /api/videos/init
Body: { "title": "...", "fileSizeBytes": ..., "contentType": "video/mp4" }
→ 200 { "videoId": "...", "uploadUrls": ["part1PresignedUrl", "part2PresignedUrl", ...] }

PUT <uploadUrls[i]>                 ← client uploads chunk i directly to storage (parallel, resumable)

POST /api/videos/{videoId}/complete
→ 202 { "videoId": "...", "status": "transcoding" }

GET /api/videos/{videoId}/manifest.m3u8        (or .mpd for DASH)
→ 200 <adaptive bitrate manifest — list of available renditions>

GET /api/videos/{videoId}/segments/{resolution}/{segmentIndex}.ts
→ 200 <video segment bytes — served via CDN, not the app server>

GET /api/videos/{videoId}/status
→ 200 { "status": "ready", "renditions": ["240p","480p","720p","1080p"] }
```

Upload is **chunked and pre-signed** (same direct-to-storage principle as problem-05's photo upload, just multipart). Playback is **manifest + segments** — the app server only ever hands out URLs and metadata; it never touches video bytes.

---

<a name="core"></a>
# 4. Core: transcoding pipeline 🎯

## Chunked, resumable upload
A video file can be gigabytes and take minutes to upload over an unreliable connection — uploading it as one giant `PUT` means any blip forces a full restart. Instead, the client splits the file into chunks (~5-10MB), gets a pre-signed URL **per chunk**, and uploads them in parallel. If chunk 7 fails, only chunk 7 is retried. Once all chunks land, object storage completes the multipart upload into a single master object and fires an event.

## The transcode fan-out
```
Upload complete (storage event)
   → job published to Queue (videoId, master storage key)
   → pool of Transcode Workers (often GPU-accelerated, ffmpeg/media codecs)
        one job PER rendition, run in PARALLEL:
          240p job  ─┐
          480p job  ─┤
          720p job  ─┼─→ each: read master → transcode → slice into
          1080p job ─┤     2-10s segments → package as HLS (.ts + .m3u8)
          4K job    ─┘     or DASH (.m4s + .mpd) → upload segments
   → each worker updates DB: that rendition is "ready"
   → once a minimum viable set is ready (e.g. 480p), video flips to
     "ready" and can start being served — 4K finishing later doesn't
     block playback (progressive availability)
```

**Why one job per rendition, not one sequential job:** renditions are fully independent of each other (all derived from the master), so running them in parallel across a worker pool turns transcode *latency* into a function of worker fleet size rather than the sum of all renditions' compute time — critical for getting a video watchable quickly after upload.

**Failure handling:** each rendition job retries independently; a job that keeps failing goes to a dead-letter queue rather than blocking the video forever; job IDs are idempotent so a retry can't produce duplicate/corrupt segments.

---

<a name="abr"></a>
# 5. Adaptive bitrate streaming, explained

This is the mechanism that makes "the video doesn't buffer when your wifi gets bad" actually work — and it's entirely a **client-side decision**, not something the server does per-request.

1. **Master manifest.** When playback starts, the player fetches `manifest.m3u8` (or `.mpd`), which lists every available rendition — resolution, bitrate, and a link to that rendition's own child playlist (its list of segment URLs). Segments are timeline-aligned across renditions: segment #42 covers the exact same 6 seconds of the video in 240p and in 1080p.
2. **Startup.** The player usually starts on a low/medium bitrate rendition to begin playback fast, then measures the actual download throughput of the first segments it fetches (bytes ÷ time).
3. **Per-segment decision.** Before requesting each subsequent segment, the player's ABR algorithm looks at recent measured throughput (and buffer health — how many seconds of video it already has queued) and picks whichever rendition's bitrate fits comfortably under that throughput for the *next* segment.
4. **Switching is seamless** because segments are independently requestable and boundary-aligned — the player can request segment #43 from the 480p track right after segment #42 came from the 720p track, and splice them together without a visible seam.
5. **Degradation and recovery:** if bandwidth drops (walking from wifi to cellular), the player detects the buffer draining and drops down a rendition to stay ahead of a rebuffer; if bandwidth is plentiful and the buffer is healthy, it steps back up.

The server's entire contribution is having **pre-generated every rendition as small independent segments** ahead of time (§4) — there is no per-request transcoding on the playback path. Segment length is a trade-off: short segments (2s) enable fast, fine-grained switching but add HTTP/manifest overhead; long segments (10s) are more efficient but adapt more slowly.

---

<a name="db"></a>
# 6. Database *(Part 8)*

```
Video: videoId (PK) | ownerId | title | description | status | durationSec
       | createdAt | thumbnailKey | renditions: [{res, bitrate, storageKey}]
```

- **NoSQL** (DynamoDB/Cassandra), keyed by `videoId` — the core access pattern is a simple key lookup ("give me this video's manifest and status"), with a flexible/evolving schema for the renditions list as jobs complete asynchronously. No joins needed on the playback hot path.
- **Search/browse** (title, tags, description) would go to a dedicated search index (Elasticsearch) — separate system, out of scope here per the requirements above.
- **View counts / watch history** are extremely high write volume and not needed synchronously — same pattern as problem-01's async click analytics and problem-05's like counters: batch through a queue into approximate counters rather than writing the primary DB on every view.

---

<a name="cdn"></a>
# 7. Storage + CDN *(Parts 2.7, 21)*

This is the textbook CDN use case, more so than almost any other design problem:

- **Perfect cacheability.** A segment for `videoId + rendition + segmentIndex` is **immutable** the moment it's produced — it never changes. That means `Cache-Control: immutable, max-age=1yr` and edge PoPs can hold it indefinitely with zero invalidation logic.
- **Extreme power-law access.** A small fraction of videos (trending/new/viral) account for the large majority of views. Those get cached at nearly every edge PoP — hit ratio near 100%, origin storage essentially never touched for hot content. This directly attacks the ~14 Tbps bandwidth number from §2: the CDN, not your origin fleet, absorbs it.
- **The long tail needs an origin-shield pattern.** Older or less-popular videos won't be cached at most edge PoPs. Without protection, a video that suddenly resurges (or is merely spread across many regions) causes every PoP that misses to hit the origin independently — a thundering herd on storage. The fix: an **origin shield** — a regional mid-tier cache sitting between edge PoPs and origin storage. Multiple edge PoPs that miss route through the *same* shield node instead of each going straight to origin, so origin sees at most one request per shield per cache-miss instead of one per PoP.
- **Origin storage** (S3-class object storage) holds the durable master + all renditions and only serves shield-tier misses — a tiny fraction of total playback traffic.

---

<a name="scaling"></a>
# 8. Scaling *(Parts 2, 21)*

Order of impact: **CDN → origin shield → elastic transcode workers → sharded metadata DB → LB + stateless control-plane servers.**

- **CDN** carries essentially all playback bandwidth — the dominant lever, same theme as problem-05 but at an even more extreme ratio (bandwidth is ~100× storage growth here).
- **Origin shield** protects storage from long-tail cache-miss thundering herds (§7).
- **Transcode worker pool** scales elastically and independently of the API tier — load is bursty (spikes right after upload waves), so **queue depth** is the natural autoscaling signal: more pending jobs → spin up more workers.
- **Metadata DB** is sharded by `videoId`; read replicas absorb browse/status-check reads.
- **Load balancer + stateless app servers** (Part 2.5) handle only the control plane — upload init, status polling, manifest signing — which is tiny relative to the data plane (segment bytes), because the data plane bypasses the app tier entirely and streams straight from CDN/storage.

---

<a name="divergence"></a>
# 8.5 YouTube vs Netflix — where the designs diverge 🎯

Everything above is the **shared spine**: chunked upload, transcode fan-out, HLS/DASH segments, ABR, immutable segments cached at the edge, origin shield. If the interviewer says "design YouTube" or "design Netflix," that spine is 70% of the answer either way.

The remaining 30% is where they genuinely differ — and naming that difference unprompted is what separates a memorized answer from a designed one.

## The one difference everything else follows from

```
  YouTube  →  UGC ingest.  Catalog is UNBOUNDED and UNPREDICTABLE.
              Hundreds of hours uploaded per minute, most of it never watched.
              You cannot know in advance what will be popular.

  Netflix  →  Curated catalog.  FIXED, KNOWN, and SMALL (tens of thousands of titles).
              Every title is acquired weeks in advance.
              You know exactly what will be popular before it launches.
```

Every divergence below is a consequence of that one line.

| | **YouTube** | **Netflix** |
|---|---|---|
| **Catalog size** | Billions of videos, growing every second | ~tens of thousands of titles |
| **Ingest rate** | Enormous, continuous, unpredictable | A trickle — a controlled publishing pipeline |
| **Encoding timing** | **Must be fast** — creators expect playable in minutes | **Offline, unhurried** — weeks of lead time available |
| **Encoding effort per title** | Cheap and uniform — you can't afford to over-invest in a video with 3 views | **Expensive and bespoke** — per-title/per-shot optimization is worth it, since the cost is amortized over millions of views |
| **Cache strategy** | **Reactive** — pull-on-demand, cache what gets watched | **Proactive** — *push* content to caches **before** anyone asks for it |
| **CDN** | Google's own global edge + peering, multi-CDN | **Open Connect** — Netflix's own appliances placed *inside ISP networks* |
| **Dominant hard problem** | Ingest scale + discovery/search + view counting | Delivery efficiency + recommendations/homepage assembly |

## Netflix's real differentiator: Open Connect

Netflix doesn't rent a commercial CDN for the bulk of its traffic — it built one and **gave the hardware to ISPs**.

```
   [Netflix origin / control plane]
              │
              │  fill window: off-peak hours, pushed PROACTIVELY
              ▼
   ┌──────────────────────────────────────────┐
   │   OCA — Open Connect Appliance            │
   │   physically inside the ISP's data centre │
   │   Netflix supplies the hardware;          │
   │   ISP supplies power, space, connectivity │
   └──────────────────────────────────────────┘
              │  (traffic steered by the ISP's own BGP advertisements)
              ▼
        [ ISP's subscribers ]
```

- **~95% of Netflix traffic** is delivered over direct connections between Open Connect and residential ISPs, localized to the interconnection point nearest the viewer.
- **The fill is proactive and scheduled.** Because the catalog is known and popularity is *predictable* (a new season's launch date is on the calendar), Netflix pushes content onto OCAs **during off-peak hours** — typically overnight — so that at peak viewing time the bytes are already sitting inside the ISP. **The cache is warm before the first request exists.**
- **The ISP controls routing** via BGP advertisements, deciding which of its subscribers are served by which appliance.
- **Why the ISP agrees:** it eliminates a huge share of their expensive transit/peering traffic. Both sides save money — that's what makes the model work commercially, and it's the part worth explaining.

> **The insight to state:** "Netflix can pre-position content because it knows its catalog and can predict demand. YouTube fundamentally cannot — nobody knows which upload goes viral — so YouTube's caching has to be **reactive**, populated by actual viewing. The same CDN concept, driven in opposite directions by whether the catalog is knowable in advance."

## YouTube's real differentiator: unbounded, unpredictable ingest

- **Multi-CDN + dynamic placement.** Google's own edge infrastructure plus commercial partners, with cache population driven by observed demand — popular content proactively distributed to more edges, the long tail pulled on demand and cached by regional interest. It's the power-law behaviour from §7, but adaptive rather than scheduled.
- **The long tail is the design constraint.** Most videos are watched almost never. You cannot pre-position billions of videos, so most content must be served acceptably from a cache miss — which is exactly why the **origin shield** (§7) matters far more for YouTube than for Netflix.
- **Encoding must be cheap per video.** Since you don't know which upload deserves investment, you encode conservatively by default and can re-encode more aggressively *later*, once a video proves popular. Netflix inverts this: heavy investment up front, because every title is known to be worth it.
- **View counting at scale is its own system.** Billions of views/day, write-heavy and approximate — that's genuinely the [Problem 19](problem-19-ad-click-aggregator.md) pipeline, not this one. Say so and move on.
- **Discovery is the product.** Search over billions of items plus recommendations is a bigger engineering surface than delivery. Netflix's equivalent — homepage row assembly over ~tens of thousands of titles — is a much smaller, more tractable ranking problem.

## Live streaming — the third variant

If the interviewer pivots to **live** (YouTube Live, sports on a streaming service), the pipeline inverts:

- **Transcode in real time**, on the ingest path — there is no offline window, and the encoder is now on the critical path.
- **Latency becomes the primary metric**, not bandwidth. Standard HLS/DASH buffers several segments and costs 10–30s of delay; **low-latency HLS / LL-DASH** cut segments into partial chunks to get to ~2–5s. Sub-second needs WebRTC (Part 26), which doesn't scale the same way.
- **No pre-positioning is possible** — the content doesn't exist yet. Every viewer is effectively a cache miss on a segment that was created seconds ago, so the edge tier must **collapse concurrent requests** for the same in-flight segment rather than fanning them all back to origin.
- **The thundering herd is structural, not accidental:** millions of viewers request the *same* new segment within the same second. Request coalescing at the edge is mandatory, not an optimization.

## How to use this in the room

> *"The upload, transcode, ABR and CDN spine is the same for both. The real fork is that Netflix has a fixed, known catalog and YouTube has unbounded, unpredictable ingest. That gives Netflix two advantages it exploits hard: it can afford expensive per-title encoding because the cost amortizes over millions of views, and it can pre-position content proactively — Open Connect appliances sitting inside ISP networks, filled overnight during off-peak, so the bytes are already inside the ISP before anyone presses play. YouTube can't do either, because nobody knows which upload goes viral, so its caching is reactive and its encoding is cheap-by-default with re-encoding once a video proves popular. Which one would you like me to go deeper on?"*

---

<a name="arch"></a>
# 9. Full architecture

```
Upload path:
[Client] → chunked, pre-signed PUTs → [Object Storage: master video]
                                              │ (storage event)
                                        [Queue: transcode jobs]
                                              │
                              [Transcode Worker Pool ×N]  (parallel per rendition)
                                              │
                          [Object Storage: HLS/DASH segments per rendition]

Playback path:
[Client] → [CDN edge PoP] ──hit──→ segment bytes returned (~100% of hot traffic)
                │ miss
        [Origin Shield]  ← de-duplicates concurrent misses per region
                │ miss
        [Object Storage: segments + manifest]

Control plane (small, separate from the above):
[Client] → [Load Balancer] → [Stateless App Servers ×N] → [Sharded, replicated
                                                             metadata DB]
           issues: upload-init URLs, status checks, manifest URL signing
```

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "Why chunk the upload instead of sending the whole file?"
> *"Video files are large and uploads over unreliable networks are common — sending it as one request means any blip restarts the whole thing. I split it into chunks, get a pre-signed URL per chunk, and upload in parallel; if one chunk fails, I only retry that chunk. It's the same direct-to-storage principle as a photo upload, just multipart."*

### Q: "Walk me through the transcoding pipeline end to end."
> *"Upload completes → storage fires an event → a job goes on a queue → a worker pool picks it up and runs one parallel job per target rendition — 240p through 4K — since they're all independently derived from the master. Each worker transcodes, slices into segments, packages as HLS or DASH, and uploads the segments. Once a minimum viable rendition is ready, the video flips to playable even if higher resolutions are still processing."*

### Q: "How does adaptive bitrate actually work on the client?"
> *"The player fetches a manifest listing every available rendition and its segment URLs. It starts on a modest bitrate, measures actual download throughput from the segments it fetches, and before each subsequent segment request picks whichever rendition's bitrate comfortably fits that throughput. Because segments are time-aligned and independently requestable across renditions, it can switch bitrate between segments with no visible seam — there's no server-side work involved in the switch itself."*

### Q: "Why is bandwidth the dominant cost here rather than storage?"
> *"Storage is paid once per video — even with five renditions it's roughly 2x the source size. Bandwidth is paid on every single view, and at scale that's roughly two orders of magnitude larger than the daily storage growth. That asymmetry is why nearly every architectural decision here — immutable segment caching, origin shielding, adaptive bitrate itself — exists to control egress, not disk usage."*

### Q: "What's an origin shield and why isn't a CDN alone enough?"
> *"A CDN's edge PoPs cache independently — for a popular video that's fine, hit ratio is near 100%. But for a long-tail video, most PoPs will miss, and if every PoP that misses hits origin storage directly, a video that suddenly gets traffic across many regions can thundering-herd the origin. An origin shield is a regional mid-tier cache that sits between edge and origin — multiple PoPs that miss route through the same shield node, so origin sees at most one request per shield per miss instead of one per PoP."*

### Q: "Is designing YouTube the same as designing Netflix?"
> *"The spine is the same — chunked upload, transcode fan-out, HLS/DASH segments, adaptive bitrate, immutable segments cached at the edge behind an origin shield. The fork is that Netflix has a fixed, known catalog and YouTube has unbounded, unpredictable ingest, and almost every other difference follows from that. Netflix can spend heavily on per-title encoding because the cost amortizes over millions of views, and it can pre-position content proactively. YouTube can't do either — nobody knows which upload goes viral — so its caching is reactive, driven by what actually gets watched, and its encoding is cheap by default with the option to re-encode once a video proves popular. YouTube's hard problems are ingest scale and discovery; Netflix's are delivery efficiency and recommendation."*

### Q: "What's Open Connect and why is it different from using a CDN?"
> *"Netflix built its own CDN and gave the hardware away to ISPs — Open Connect Appliances sit physically inside an ISP's network, with Netflix supplying the servers and the ISP supplying power, space and connectivity, and the ISP steering its own subscribers to them via BGP. Around ninety-five percent of Netflix traffic is delivered that way. The part that makes it more than 'a CDN they own' is the fill strategy: because the catalog is known and demand is predictable — a season's launch date is on the calendar — content is pushed onto those appliances overnight during off-peak hours, so the bytes are already inside the ISP before the first viewer presses play. The cache is warm before any request exists. And the ISP agrees because it removes a large share of their expensive transit traffic, so both sides save. YouTube fundamentally can't run that play, because you can't pre-position content when you don't know what will be popular."*

### Q: "How would this change for live streaming?"
> *"It largely inverts. Transcoding moves onto the ingest path in real time, so the encoder is now on the critical path with no offline window. Latency replaces bandwidth as the primary metric — standard HLS buffers several segments and costs ten to thirty seconds, so I'd use low-latency HLS or LL-DASH with partial chunks to get to a few seconds, and WebRTC only if I genuinely need sub-second, accepting that it doesn't scale the same way. And pre-positioning becomes impossible because the content doesn't exist yet: every viewer is effectively a cache miss on a segment created seconds ago. That makes the thundering herd structural rather than accidental — millions of viewers request the same new segment in the same second — so request coalescing at the edge is mandatory, not an optimization."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** one-time write cost, massively repeated read cost; bandwidth ≈ 100× storage growth.
- **Estimate:** ~50 uploads/s, ~1.4PB/day stored, **~14 Tbps sustained egress** from ~1B views/day.
- **Core:** chunked pre-signed upload → queue → parallel transcode workers, one job per rendition (240p–4K) → HLS/DASH segments; progressive availability once a minimum rendition is ready.
- **ABR:** manifest lists renditions; player measures throughput per segment and picks the next segment's bitrate accordingly; switching is client-side, segments are time-aligned across renditions.
- **DB:** NoSQL, keyed by videoId; renditions list evolves as async jobs complete; view counts async/approximate.
- **CDN:** segments are immutable → cache forever at edge; power-law access means hot content is ~100% edge-served.
- **Origin shield:** protects storage from long-tail cache-miss thundering herds — regional dedup layer between edge and origin.
- **Scale:** CDN → origin shield → elastic transcode workers (queue-depth autoscaling) → sharded metadata DB → thin stateless control plane.

**YouTube vs Netflix (§8.5) — the fork:**
- **One difference drives all others:** YouTube = **unbounded, unpredictable UGC ingest**; Netflix = **fixed, known, curated catalog**.
- **Encoding:** YouTube cheap-and-fast by default, re-encode later if it proves popular (can't over-invest in a video with 3 views). Netflix expensive per-title/per-shot offline — amortized over millions of views.
- **Caching:** YouTube **reactive** (pull on demand, driven by observed viewing, multi-CDN + dynamic placement). Netflix **proactive** — pre-position before any request exists.
- **Open Connect:** Netflix-built appliances **inside ISP networks** (Netflix gives hardware, ISP gives power/space/connectivity, ISP steers via BGP). **~95% of traffic.** Filled **overnight off-peak** — warm cache before launch. ISP agrees because it kills their transit cost.
- **Long tail:** YouTube's constraint (most videos rarely watched → **origin shield matters far more**). Netflix barely has one.
- **Other hard problems:** YouTube = ingest scale, discovery/search, **view counting** (→ that's Problem 19's pipeline, not this one). Netflix = delivery efficiency, homepage/recommendation ranking.
- **Live variant:** real-time transcode on the ingest path · **latency replaces bandwidth** as the metric (LL-HLS/LL-DASH ~2–5s, WebRTC for sub-second) · no pre-positioning possible → **request coalescing at the edge is mandatory**, herd is structural.

*— Design Problem 11 complete —*
