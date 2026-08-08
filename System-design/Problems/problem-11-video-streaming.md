# Design Problem 11 — Video Streaming (YouTube / Netflix)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 02.7, 20, 21. **Signature challenge:** chunked upload + transcoding pipeline, and adaptive-bitrate delivery via CDN.

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

*— Design Problem 11 complete —*
