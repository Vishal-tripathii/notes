# Design Problem 10 — Ride-Sharing (Uber HLD)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 21, 24, 26.
>
> **Signature challenge:** geospatial matching (finding nearby drivers fast) + real-time location updates at scale.
>
> **Note:** `../../LLD/Problems/problem-09-cab-booking-uber.md` covers the **CLASS design** (Trip state machine, driver-match locking) for one service instance — this file is the **SYSTEM**: how millions of location updates/sec and matching queries are handled across a fleet.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: geospatial indexing](#core)
5. [Real-time location updates](#realtime)
6. [Database](#db)
7. [Matching + dispatch](#matching)
8. [Scaling — shard by geography](#scaling)
9. [Full architecture](#arch)
10. [Interview Q&A](#interview)
11. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Rider requests a ride from location **A** to **B**.
2. System **finds and matches** a nearby available driver.
3. Both parties see **real-time location** of the other during the trip.

**Non-functional:**
- **Low-latency matching** — offer a driver within a couple of seconds of the request.
- **High availability** — a down matching service means no rides, city-wide.
- **Massive concurrency** — millions of drivers online, all moving, all the time.
- **Fresh location data** — a driver's position must be usable within a few seconds of being sent, or the match is wrong.
- **Consistency where it counts** — "one driver → at most one active trip" must never be violated, even under concurrent match attempts (strong consistency on *assignment*), but the constant stream of GPS pings can be eventually consistent / best-effort.

> Two very different data shapes live in one product: **location pings** (extreme write volume, ephemeral, sloppy consistency OK) vs **trip assignment** (low volume, must be exactly-once, strongly consistent). That split drives almost every design decision below.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume **5M concurrent active drivers** globally, each pinging location every **4 seconds**.
- **Location writes/sec:** 5M ÷ 4 ≈ **~1.25M/s** ← the dominant number in this system.
- **Ride requests:** ~100K requests/min → **~1,700 matching queries/sec**.
- **Trip records:** ~20M trips/day × ~1KB ≈ **~20GB/day** of durable trip data — tiny compared to location traffic.
- **Location storage:** at 1.25M writes/sec, storing every ping durably is wasteful and unnecessary — only the **latest position per driver** matters for matching, so this lives in memory, not a growing table.

> The estimation itself tells the story: **1.25M/s ephemeral writes vs 1,700/s matching reads vs 20GB/day durable data.** Design for the first number; don't let it touch the durable database.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
POST /api/rides/request
Body: { "riderId", "pickup": {lat,lng}, "dropoff": {lat,lng} }
→ 201 { "rideId", "status": "MATCHING" }

WS  driver → server: { "driverId", "lat", "lng", "ts" }   (location ping, every ~4s)

GET /api/rides/{rideId}/status
→ 200 { "status", "driverId", "driverLocation": {lat,lng}, "etaSec" }

WS  server → rider/driver: { "rideId", "driverLocation" | "riderLocation", "status" }
```
Location pings and live status are **push, not poll** — see Part 26 (§5).

---

<a name="core"></a>
# 4. Core: geospatial indexing 🎯

**The problem:** "find available drivers within ~2km of (37.77, -122.41)" — run millions of times a minute, against millions of moving points.

### Why a naive DB scan doesn't work
```sql
SELECT * FROM drivers
WHERE lat BETWEEN 37.75 AND 37.79
  AND lng BETWEEN -122.43 AND -122.39
  AND status = 'available'
```
A B-tree index on `lat` alone (or `lng` alone) only narrows **one dimension** — the DB still scans every row matching that one range and filters the other in memory. There's no single 1-D index that captures "close in 2-D space." At 1.25M location writes/sec constantly invalidating rows, this also means constant index churn on a disk-backed table. It doesn't scale.

### The fix: geohashing
**Geohash** interleaves the bits of latitude and longitude into one string, so that **points physically near each other share a common prefix**.
```
San Francisco: 37.7749, -122.4194 → geohash "9q8yyk8y"
Nearby point:  37.7750, -122.4190 → geohash "9q8yyk8z"   (same 7-char prefix "9q8yyk8")
```
Now "find nearby drivers" becomes a **string prefix lookup** — a cheap, indexable range scan (`geohash LIKE '9q8yyk%'`), or a direct key lookup in a hash/sorted-set structure. Precision is just string length:

| Prefix length | Cell size (approx) |
|---|---|
| 5 chars | ~4.9km × 4.9km |
| 6 chars | ~1.2km × 0.6km |
| 7 chars | ~150m × 150m |

Pick the precision that matches your search radius (e.g. 6–7 chars for "nearby drivers").

**The edge case:** a rider standing right at a cell boundary may have the closest driver sitting in the *adjacent* cell, invisible to a same-prefix-only query. Fix: always query **the rider's cell + its 8 neighboring cells** (a 3×3 grid), not just one.

### Alternative: quad-tree
Recursively divide the map into 4 quadrants, subdividing further **only where driver density is high** — dense Manhattan gets many tiny cells, sparse countryside stays one big cell.
```
World
 ├─ NW ─┬─ subdivide (dense city) ─┬─ ...
 ├─ NE
 ├─ SW  (sparse — stays one leaf, no subdivision)
 └─ SE
```
- **Trade-off vs geohash:** geohash cells are **fixed-size** regardless of density — wasteful in empty rural cells, and can still be too coarse in a hyper-dense downtown at rush hour. A quad-tree **adapts to density**, giving roughly even driver-counts per leaf — better for the real-world unevenness of a rideshare fleet — but it's a tree that needs rebalancing as density shifts (e.g. concerts, rush hour), which is more operational complexity than a stateless geohash string.
- In practice, systems like Uber evolved to **hexagonal hierarchical grids (H3)** — same core idea (recursive spatial cells) but hexagons avoid the distortion square cells get near the poles and give more uniform neighbor adjacency. Good to *namedrop* in an interview; geohash or quad-tree is enough to design live.

---

<a name="realtime"></a>
# 5. Real-time location updates *(Part 26)*

Opening a fresh HTTP connection for every 4-second ping, across 5M drivers, is pure overhead (handshake + headers each time). Instead, each driver app holds a **persistent WebSocket connection** (Part 26 §4) to a connection-server layer; a location ping is then just a tiny frame on an already-open socket.

```
Driver app ──(WS, sticky)──▶ Connection Server ──▶ writes latest {lat,lng} + geohash
                                                      into an IN-MEMORY geospatial store
```

**Keeping the index fresh without falling over:**
- The store is **in-memory** (Redis with `GEOADD`/`GEOSEARCH`, or a custom service) — not the durable trip database. 1.25M writes/sec would crater a disk-backed table; an in-memory KV structure absorbs it easily.
- Each write is a **blind overwrite** of "driver X's last known position" — no history, no append, no read-modify-write. Cheap and idempotent.
- Most updates **don't even change the geohash cell** (a driver moving a few meters at city speed rarely crosses a ~150m cell boundary), so in practice it's often just refreshing a value/TTL in place.
- **Sticky routing** (Part 26 §6b) keeps a driver's socket pinned to one connection server for its life — needed so the server tracking that driver's state doesn't have to be rediscovered every message.
- Anything that *does* need history (trip playback, surge-pricing analytics, fraud detection) is **not** read off this hot path — pings are also fanned out async onto a queue (Part 13/14) to a separate analytics store, so the hot in-memory index stays lean.

---

<a name="db"></a>
# 6. Database *(Part 8)*

Three very different access patterns living side by side:

| Data | Pattern | Where it lives |
|---|---|---|
| **Live driver location** | ~1.25M writes/sec, latest-value-only, no durability needed | In-memory geospatial index (Redis Geo), sharded by region |
| **Trip records** (`tripId`, riderId, driverId, pickup, dropoff, status, fare, timestamps) | Written a handful of times per trip (status transitions), then read for history/receipts — moderate write, moderate-to-low read | Durable NoSQL (Cassandra/DynamoDB) — simple key lookup by `tripId`, huge volume, no joins needed |
| **Driver/rider profiles** (rating, vehicle, payment) | Rarely written, read constantly (every match, every trip start) | SQL or NoSQL + **cache-aside** (Part 5) — classic read-heavy hot data |

> The system's signature trait: the **hottest** data (location) is the **least durable**, and the **most durable** data (trips) is comparatively low-volume. Don't force location pings through the same database as trip records — that's the single most common mistake in this design.

---

<a name="matching"></a>
# 7. Matching + dispatch

Once the geospatial index returns candidates (rider's cell + 8 neighbors, filtered to `status = available`), rank and dispatch:

1. **Nearest-first as the base filter** — geodistance from the index narrows a few hundred candidates down to a handful instantly.
2. **Refine by real ETA, not straight-line distance** — the nearest driver by air might be on the far side of a river; pass the top few candidates through a routing engine for actual road ETA.
3. **Tie-break on driver quality/fairness** — rating, acceptance rate, idle time (how long since their last trip, for fair rotation), vehicle type match (XL, pet-friendly, etc).
4. **Offer, don't force** — send the ride offer to the top candidate with a short accept window (~10–15s). Decline/timeout → offer the next candidate.

**The concurrency problem (why this isn't just a sorted list):** two nearby ride requests can both compute the *same* driver as their best candidate at nearly the same instant. Whoever's dispatch reads the driver's status first must **atomically claim** it (compare-and-swap the driver's status from `available` → `matched`, or a short-lived distributed lock) before sending the offer — otherwise the same driver gets double-booked. That per-instance locking mechanics and the trip's state machine (`REQUESTED → MATCHED → EN_ROUTE → IN_PROGRESS → COMPLETED`) is exactly what `../../LLD/Problems/problem-09-cab-booking-uber.md` designs at the class level; here the point is just that dispatch needs **one atomic claim operation**, however it's implemented underneath.

---

<a name="scaling"></a>
# 8. Scaling — shard the spatial index by geography *(Part 21, 24)*

A driver in Mumbai is **never** a valid match for a rider in Delhi. Geography is a naturally clean **shard key** — unlike most systems, there's essentially no cross-shard query in the common case.

```
World map ──▶ split into regions (by city / metro area, or by a coarse S2/geohash prefix)
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
[Region: Mumbai] [Region: Delhi] [Region: NYC]
  own in-memory     own in-memory     own in-memory
  geospatial index   geospatial index   geospatial index
  own dispatch svc    own dispatch svc   own dispatch svc
```
- Each region runs its **own** geospatial index + dispatch service, ideally deployed in a data center near that region (lower latency, Part 3).
- **Two levels of partitioning working together:** geohash *cells* subdivide space **within** a region for the fine-grained "nearby" lookup (§4); the *region* itself is the coarse **shard key across machines** (§8) — same layered idea as Part 21's sharding, applied twice at different granularities.
- **Boundary edge case:** a rider near a region border may occasionally need a peek at the neighboring shard's edge cells — same fix as the geohash neighbor problem, just one level up.
- **Hot regions can be re-split** as a city's driver density grows (e.g. splitting one mega-region into two). This is where **consistent hashing (Part 24)** earns its keep over naive range partitioning — it lets you carve out a new shard while remapping only the fraction of drivers/keys that fall in the new boundary, not the whole region's data.
- **Independent auto-scaling per region** — NYE surge in NYC shouldn't force scaling Mumbai's dispatch fleet.

---

<a name="arch"></a>
# 9. Full architecture

```
[Rider App]                                   [Driver App]
     │                                              │
     ▼                                              ▼
        [Gateway / LB — WebSocket-aware, sticky]     (Part 26)
                        │
        [Connection Servers ×N]  ← holds live sockets, per driver/rider
              │                              │
    (location ping, ~4s)              (ride request / status)
              ▼                              ▼
 [Regional in-memory geospatial   [Matching / Dispatch Service]
   index — Redis Geo, sharded            │  queries index: own
   by region]  ◀──────────────────────────┘  geohash cell + 8 neighbors
              │                              │
       (async, batched)              atomic claim → assign
              ▼                              ▼
   [Queue → analytics / location   [Trip DB — sharded + replicated]
     history, Part 13/14]           (Cassandra/DynamoDB, Part 21)
                                              │
                                   [Driver/Rider Profile Store
                                     + cache-aside, Part 5]
```
**Read path (matching):** rider request → dispatch → regional geo-index (cell + neighbors) → rank by ETA/rating → atomic claim → push offer over the driver's live socket.
**Write path (location):** driver ping → connection server → in-memory regional index (blind overwrite) → async fan-out to analytics queue.

---

<a name="interview"></a>
# 10. Interview Q&A

### Q: "How do you find nearby drivers efficiently?"
> *"I wouldn't run a lat/long range query against the primary database — a B-tree index only helps one dimension, so it still scans and filters in memory, and at this write volume a disk-backed table can't keep up anyway. Instead I geohash every driver's position — encoding lat/long into a string where nearby points share a prefix — and keep that in an in-memory store like Redis. 'Find nearby drivers' becomes a prefix lookup: my cell plus the 8 neighboring cells, to catch drivers just across a boundary."*

### Q: "What's actually wrong with `WHERE lat BETWEEN x AND y AND lng BETWEEN x AND y`?"
> *"An index on lat alone, or lng alone, only narrows one dimension — the database still has to scan and filter the other range in memory, so it doesn't get the 2-D locality you actually want. And with over a million location writes a second, a disk-backed table with that row constantly updating would fall over from index churn alone."*

### Q: "Walk me through geohashing with an example."
> *"You interleave the bits of latitude and longitude into one string, so physically close points end up with a shared prefix — San Francisco might hash to '9q8yyk8y', and a point 10 meters away shares the first 7 characters. Precision is just string length: a 5-character prefix covers roughly a 5km cell, 7 characters roughly 150m. I pick the length that matches my search radius, then 'nearby' is a cheap prefix match instead of a 2-D range scan."*

### Q: "Geohash vs quad-tree — which would you use?"
> *"Geohash cells are fixed size, so they're wasteful in empty rural areas and can still be too coarse in a packed downtown at rush hour. A quad-tree subdivides recursively based on actual density — dense areas get many small cells, sparse areas stay coarse — so it adapts to the real unevenness of a driver fleet. The cost is it's a tree that needs rebalancing as density shifts, versus a geohash which is just a stateless string computation. I'd lean geohash for simplicity unless density is extremely uneven, in which case the adaptivity is worth the complexity — Uber's actual evolution went toward hexagonal hierarchical cells for similar reasons plus better neighbor uniformity."*

### Q: "How do you keep the spatial index fresh with over a million writes a second?"
> *"Location pings are ephemeral — I don't need history, just each driver's latest position, so it lives in an in-memory store, not the durable database. Each ping is a blind overwrite, and most pings don't even cross a geohash cell boundary at normal driving speed, so it's cheap in practice. Drivers push over a persistent WebSocket rather than opening a new HTTP connection every few seconds, which avoids handshake overhead at that frequency across millions of devices. Anything needing history — analytics, trip playback — is fanned out asynchronously to a separate store, off the hot path."*

### Q: "How do you scale this globally?"
> *"Geography is a natural shard key — a driver in Mumbai is never a candidate for a rider in Delhi, so I shard the spatial index and dispatch service by region, each with its own in-memory index and, ideally, a data center near that region. Within a region I still use geohash cells for the fine-grained lookup — it's two layers of partitioning. If one region gets hot, I can split it into two shards; consistent hashing lets me do that while remapping only the drivers near the new boundary instead of the whole region."*

---

<a name="cheatsheet"></a>
# 11. Cheat Sheet

- **Shape:** two workloads in one system — ephemeral, extreme-write location pings (~1.25M/s) vs low-volume, must-be-exact trip assignment.
- **Estimate:** ~1.25M location writes/s, ~1,700 matching req/s, ~20GB/day durable trip data.
- **Core:** geohash — interleave lat/lng bits → prefix-sharing string → "nearby" = prefix lookup on own cell + 8 neighbors. Quad-tree = adaptive-density alternative (better uneven distribution, more rebalancing complexity). H3 hex grid = real-world evolution of both.
- **Real-time:** persistent WebSocket per driver (not polling); blind overwrite into an in-memory geo-index; history goes async to a separate analytics store.
- **DB:** location → in-memory only; trips → durable NoSQL, sharded/replicated; profiles → cache-aside (read-heavy).
- **Matching:** geo-index narrows candidates → rank by real ETA + rating/fairness → offer with timeout → **atomic claim** (CAS/lock) to prevent double-booking.
- **Scale:** shard the whole system by **region** (geography = natural shard key, near-zero cross-shard queries); geohash cells subdivide *within* a shard; consistent hashing to re-split a hot region with minimal remap.
- **Cross-refs:** Part 26 (WebSockets/sticky LB for the connection layer), Part 21 (replication/sharding for the trip DB), Part 24 (consistent hashing for resharding a hot region).

*— Design Problem 10 complete —*
