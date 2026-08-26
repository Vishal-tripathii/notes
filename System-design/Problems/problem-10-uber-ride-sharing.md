# Design Problem 10 — Ride-Sharing (Uber HLD)

> **Signature challenge:** geospatial matching (finding nearby drivers fast) + real-time location updates at scale.
>
> **⚠️ This file uses a different structure to the others — deliberately.** It is the **reference implementation** of a flow-first approach:
>
> ```
> PART I  — establish the FLOW,  driven by FUNCTIONAL requirements     ("what does it do?")
> PART II — make it WORK AT SCALE, driven by NON-FUNCTIONAL requirements ("what breaks?")
> ```
>
> The architecture is **built incrementally, one functional requirement at a time** — each stage adds only the components that requirement forces, and the diagram grows with it (★ marks what's new). By the end of Part I you have the whole system and you *derived* it. Only then do the non-functional requirements become deep dives.
>
> **Why:** in a real interview you draw the design live while talking. Revising in the order you'll perform beats revising in the order a textbook lists topics. The old structure jumped straight to the hardest optimization before the system's flow existed.
>
> **Companions:** `../../LLD/Problems/problem-09-cab-booking-uber.md` is the **class design** for one service instance. [`problem-17-food-delivery-swiggy-zomato.md`](problem-17-food-delivery-swiggy-zomato.md) reuses this file's geospatial index but is *not* "Uber for food" — it's 1:N batching with deliberately delayed assignment.

---

## Table of Contents

**PART I — Establish the flow**
1. [Requirements](#requirements)
2. [Core Entities](#entities)
3. [API Design](#api)
4. [High-Level Design — built one requirement at a time](#hld)
   - [4.1 Rider gets a fare estimate](#hld1)
   - [4.2 Rider requests the ride](#hld2)
   - [4.3 System matches a nearby driver](#hld3)
   - [4.4 Driver accepts and navigates](#hld4)
   - [4.5 The complete flow](#hld5)

**PART II — Make it work at scale**

5. [Capacity Estimation — where the numbers bite](#estimation)
6. [Deep Dive 1 — Geospatial index 🎯](#dd1)
7. [Deep Dive 2 — Surviving 2M location writes/sec](#dd2)
8. [Deep Dive 3 — Never double-assign a driver](#dd3)
9. [Deep Dive 4 — Never drop a ride request](#dd4)
10. [Deep Dive 5 — The driver who never answers](#dd5)
11. [Deep Dive 6 — Geo-sharding](#dd6)
12. [**Deep Dive 7 — Dynamic (surge) pricing** 💰](#dd7)
13. [Database — consolidated](#db)
14. [Final architecture](#arch)
15. [How the real system does it](#realworld)
16. [Interview Q&A](#interview)
17. [Cheat Sheet](#cheatsheet)

---
---

# PART I — ESTABLISH THE FLOW

*Driven by the **functional** requirements. Goal: a working system, correctness before scale.*

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

### Functional — in scope
1. Rider inputs a **start location and destination** and gets a **fare estimate**.
2. Rider **requests a ride** based on that estimate.
3. On request, the rider is **matched with a nearby, available driver**.
4. Driver can **accept or decline**, then navigate to pickup and drop-off.

### Functional — explicitly out of scope
*Say these out loud and get agreement — scoping is graded.*
- Rating rides/drivers/passengers post-trip
- Scheduling rides in advance
- Ride categories (X, XL, Comfort) — *note this is a ranking filter, not a structural change*

### Non-functional — in scope
1. **Low-latency matching** — under ~1 minute to a match **or a definitive failure**.
2. **Strong consistency in matching** — a driver must **never** be assigned two rides simultaneously.
3. **High throughput at peak** — special events and surges, e.g. **100K requests from the same location**.

### Non-functional — out of scope
- GDPR / data privacy compliance
- Redundancy and failover mechanisms
- Monitoring, logging, alerting
- CI/CD and zero-downtime deploys

> **The one framing sentence to open with:** *"Two very different data shapes live in one product — **location pings** (extreme write volume, ephemeral, sloppy consistency fine) and **ride assignment** (low volume, must be exactly-once and strongly consistent). Almost every decision below follows from keeping those two apart."*

**Notice the mapping** — each non-functional requirement becomes a deep dive in Part II. That's not a coincidence, it's the structure:

| Non-functional requirement | Becomes |
|---|---|
| Low-latency matching | [DD1 — geospatial index](#dd1), [DD6 — geo-sharding](#dd6) |
| Strong consistency | [DD3 — never double-assign](#dd3) |
| High throughput | [DD2 — location writes](#dd2), [DD4 — never drop a request](#dd4) |
| "…or a definitive failure" | [DD5 — the driver who never answers](#dd5) |
| *(not an NFR — the `demand` term in §4.1's pricing model)* | [DD7 — dynamic pricing](#dd7) |

---

<a name="entities"></a>
# 2. Core Entities

Name the nouns **before** designing endpoints — the API then falls out of them instead of being invented.

| Entity | Holds | Notes |
|---|---|---|
| **Rider** | profile, payment method | |
| **Driver** | profile, vehicle, preferences, availability status | `status` is what DD3 fights over |
| **Fare** | pickup, destination, **quoted price**, ETA | ⭐ Created *before* the ride exists — see below |
| **Ride** | riderId, driverId, fareId, status, route, timestamps | The durable record of a trip |
| **Location** | driverId, lat, lng, **updatedAt** | ⭐ Ephemeral, latest-value-only, ~1000× the volume of everything else |

**Two entities are worth pausing on, because they carry design decisions:**

**`Fare` exists as a separate entity, created before the `Ride`.** That's not bookkeeping — it's what makes the quoted price binding. The rider sees a price, and the ride they then request references *that* `fareId`. Without a persisted Fare, the price could be recomputed at request time and differ from what the rider agreed to (traffic changed, surge kicked in) — a trust-destroying bug. **The Fare is a short-lived quote the system commits to.**

*(A **Surge Map** — cell → multiplier — also exists, but it is **derived state**, not an entity: it is continuously recomputed from events and is never the source of truth for anything. See [DD7](#dd7).)*

**`Location` is separated from `Driver` on purpose.** They look like one entity ("a driver has a location") and modelling them as one is the single most common mistake in this design. Driver profiles are written rarely and read constantly; locations are written **~1.25 million times per second** and never need history. Merging them drags the entire driver table into the write storm. [DD2](#dd2) is entirely about this split.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

One endpoint per functional requirement — that's the check that the API is complete and nothing is extra.

```
① Fare estimate  (FR1)
POST /fare
Body: { "pickup": {lat,lng}, "destination": {lat,lng} }
→ 200 { "fareId", "estimatedPrice", "estimatedDurationSec" }
   Creates a Fare. Does NOT create a Ride and does NOT reserve a driver.

② Request the ride  (FR2)
POST /rides
Headers: Idempotency-Key: <UUID>
Body: { "fareId" }                          ← references the QUOTED price, doesn't restate it
→ 201 { "rideId", "status": "MATCHING" }

③ Driver location update  (FR3, continuous)
POST /drivers/location
Body: { "lat", "lng" }                      ← NOTE: no driverId in the body
→ 200

④ Driver accepts or declines  (FR4)
PATCH /rides/{rideId}
Body: { "action": "ACCEPT" | "DECLINE" }
→ 200 { "rideId", "status", "pickupLocation": {lat,lng} }

⑤ Ride status / live tracking
GET /rides/{rideId}
WS  server → rider : { "rideId", "status", "driverLocation" }
```

**Four choices worth defending:**

1. **`POST /rides` takes a `fareId`, not a price.** The client never sends the amount — it sends a reference to a quote the server issued. A client that could send its own price could send `₹1`.
2. **`driverId` comes from the session/JWT, never the request body.** If the body carried `driverId`, any driver could spoof another driver's location — trivially poisoning the matching index. **Identity comes from the credential, never from user-controlled input.** This is a one-line answer that reliably earns credit.
3. **`PATCH /rides/{rideId}`, not `POST /rides/{rideId}/accept`.** Accepting is a *state transition on an existing resource*, so it's a partial update of that resource. Minor, but it's the kind of detail that signals API fluency.
4. **Location updates are `POST` over a persistent connection, not fresh HTTP requests.** At one ping every few seconds across millions of drivers, TCP+TLS handshake overhead per ping is larger than the payload. See [DD2](#dd2).

---

<a name="hld"></a>
# 4. High-Level Design — built one requirement at a time

**The rule for this section: no component appears until a functional requirement forces it.** Each stage's diagram is the previous stage's diagram plus what's new (★).

---

<a name="hld1"></a>
## 4.1 — FR1: Rider gets a fare estimate

The rider enters pickup and destination. We need real-world distance and travel time (which is a routing problem we are **not** going to solve ourselves), apply a pricing model, and persist the quote.

```
   [Rider App]
        │  POST /fare {pickup, destination}
        ▼
   ┌─────────────────┐
   │  API Gateway ★  │   authN, rate limiting          (Parts 15, 23)
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐        ┌──────────────────────┐
   │  Ride Service ★ │ ─────▶ │ Mapping API ★        │  3rd party (Google/Mapbox):
   │                 │ ◀───── │ distance + duration  │  road distance & travel time
   └─────────────────┘        └──────────────────────┘
        │  price = f(distance, duration, demand)
        ▼
   ┌─────────────────┐
   │  Database ★     │   Fare { fareId, pickup, dest, price, eta, expiresAt }
   └─────────────────┘
```

**Decisions made here:**
- **Buy, don't build, the routing.** Road distance and traffic-aware ETA is a whole company's worth of work. Call a mapping provider and say so explicitly — knowing what *not* to build is a signal, not a cop-out.
- **The Fare is persisted and given a short TTL** (a few minutes). A quote must expire, or a rider could sit on a cheap off-peak fare and redeem it during surge.
- **Nothing is reserved yet.** No driver is held, no ride exists. An estimate is free and must stay free — riders check prices far more often than they book, so this path is high-volume and must never touch the matching machinery. *(That high volume turns out to be an asset: every fare check is a **demand signal** — see [DD7](#dd7).)*
- ⚠️ **`price = f(distance, duration, demand)` hides the interesting half.** Distance and duration come from the mapping API. **The `demand` term is dynamic (surge) pricing**, and it is a whole streaming system of its own — deferred to **[Deep Dive 7](#dd7)** so Part I stays a flow.

---

<a name="hld2"></a>
## 4.2 — FR2: Rider requests the ride

The rider accepts the quote. We create a `Ride` in `MATCHING` state and kick off matching. **No new endpoint for matching** — it's an internal workflow triggered by the ride's creation, not something a client calls.

```
   [Rider App]
        │  POST /fare ①          POST /rides {fareId} ②
        ▼
   ┌─────────────────┐
   │  API Gateway    │
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐        ┌──────────────────────┐
   │  Ride Service   │ ─────▶ │ Mapping API          │
   └─────────────────┘        └──────────────────────┘
        │
        │  ★ create Ride { status: MATCHING }, then trigger matching
        ▼
   ┌──────────────────────────────────┐
   │  Database                        │
   │   Fare  { ... }                  │
   │   Ride ★ { rideId, riderId,      │
   │            fareId, status,       │
   │            driverId: null }      │
   └──────────────────────────────────┘
```

**Decisions made here:**
- **Validate the Fare before creating the Ride** — does it exist, is it this rider's, has it expired? This is where the quote becomes a commitment.
- **`status: MATCHING` is a real, persisted state**, not an in-memory flag. Matching may take tens of seconds and can span a service restart; if the state lives only in a process, a deploy loses the ride. This is the seed of [DD5](#dd5).
- **The response returns immediately** with `MATCHING`. Matching is asynchronous — the rider watches for updates rather than holding a request open for 30 seconds.

---

<a name="hld3"></a>
## 4.3 — FR3: System matches a nearby driver

Now we need drivers, and we need to know where they are. Two new services, because there are two genuinely different jobs: **ingesting location** (constant, high-volume, write-heavy) and **matching** (bursty, read-heavy, decision-making).

```
   [Rider App]                                    [Driver App ★]
        │                                              │  POST /drivers/location
        ▼                                              │  (continuous)
   ┌─────────────────┐                                 ▼
   │  API Gateway    │ ──────────────────▶  ┌──────────────────────┐
   └─────────────────┘                      │  Location Service ★  │
        │                                   └──────────────────────┘
        ▼                                              │  write latest position
   ┌─────────────────┐   ┌──────────────┐              ▼
   │  Ride Service   │──▶│ Mapping API  │   ┌──────────────────────┐
   └─────────────────┘   └──────────────┘   │  Location Store ★    │
        │                                   │  driverId → lat,lng  │
        │ trigger match                     └──────────────────────┘
        ▼                                              ▲
   ┌──────────────────────────┐                        │ "who is near
   │  Ride Matching Service ★ │ ───────────────────────┘  (lat,lng)?"
   │  • find nearby available │
   │  • rank candidates       │
   └──────────────────────────┘
        │
        ▼
   ┌──────────────────────────────────┐
   │  Database:  Fare | Ride          │
   └──────────────────────────────────┘
```

**Decisions made here:**
- **Location Service and Ride Matching Service are separate.** Ingest is a firehose of tiny writes; matching is a low-volume, latency-sensitive read-and-decide. They scale on different axes and fail differently — one service doing both means a location spike degrades matching.
- **Matching produces a *ranked list*, not one driver.** Drivers decline. The list is the retry path, and it's what [DD5](#dd5) walks down.
- **Ranking is not just distance.** Real **road ETA** (not straight-line — the nearest driver may be across a river), then driver rating, idle time for fairness, and vehicle type.

> Right now "who is near (lat,lng)?" is a hand-wave. **That's intentional** — at this stage it just needs to work. It's the signature challenge and it gets solved properly in [DD1](#dd1), once we know the traffic shape.

---

<a name="hld4"></a>
## 4.4 — FR4: Driver accepts and navigates

We must reach a driver who may not have the app open. **This is where a naive design breaks**: you cannot push down a WebSocket to a backgrounded app — the OS has suspended it.

```
   [Rider App]                                     [Driver App]
        │                                            ▲     │  PATCH /rides/{id}
        ▼                                            │     │  {ACCEPT | DECLINE}
   ┌─────────────────┐                               │     ▼
   │  API Gateway    │ ◀─────────────────────────────┼─────┘
   └─────────────────┘                               │
        │                                            │  ★ push wakes the app
        ▼                                   ┌────────────────────────┐
   ┌─────────────────┐                      │ Notification Service ★ │
   │  Ride Service   │                      │   APNs (iOS)           │
   └─────────────────┘                      │   FCM  (Android)       │
        │                                   └────────────────────────┘
        ▼                                            ▲
   ┌──────────────────────────┐                      │ offer ride to
   │  Ride Matching Service   │ ─────────────────────┘ candidate #1
   │  ranked: [d7, d3, d9]    │                        (then #2, #3…)
   └──────────────────────────┘
        │                                   ┌──────────────────────┐
        ▼                                   │  Location Service    │
   ┌──────────────────────────────────┐     │  Location Store      │
   │  Database:  Fare | Ride          │     └──────────────────────┘
   │  Ride.driverId ← d7 on ACCEPT ★  │
   └──────────────────────────────────┘
```

**Decisions made here:**
- **Push notifications (APNs/FCM), not only a socket.** A live WebSocket is the fast path when the driver app is in the foreground; a push notification is what **wakes a backgrounded app**. You need both, and saying only "push it down the socket" leaves the common case broken.
- **Offer, don't assign.** The driver is *offered* the ride with a short acceptance window (~10s). Accept → assigned. Decline or timeout → next candidate.
- **On accept, `Ride.driverId` is set in the durable database** — that write is the moment of truth, and [DD3](#dd3) is about making it safe under concurrency.
- **Navigation is on-device.** Return the pickup coordinates and let the driver's map app route. Don't build turn-by-turn.

---

<a name="hld5"></a>
## 4.5 — The complete flow

Every component now exists because a requirement demanded it. Here is the whole thing, end to end:

```
   [Rider App]                                          [Driver App]
       │                                                  │      ▲
       │ ① POST /fare                                     │      │ ④ push offer
       │ ② POST /rides {fareId}                           │      │
       │ ⑤ WS: live status                                │ ③ POST /drivers/location
       ▼                                                  ▼      │
   ┌────────────────────── API Gateway ──────────────────────┐   │
   └─────────────────────────────────────────────────────────┘   │
       │                          │                              │
       ▼                          ▼                              │
  ┌──────────────┐        ┌────────────────────┐                 │
  │ Ride Service │───────▶│ Mapping API (3P)   │                 │
  │  • fare calc │        └────────────────────┘                 │
  │  • create    │                                               │
  │    Ride      │        ┌────────────────────┐                 │
  └──────────────┘        │ Location Service   │                 │
       │                  └────────────────────┘                 │
       │ trigger                   │                             │
       ▼                           ▼                             │
  ┌──────────────────────┐   ┌────────────────────┐              │
  │ Ride Matching Svc    │──▶│ Location Store     │              │
  │  • query nearby      │   │ driverId→lat,lng   │              │
  │  • rank candidates   │   └────────────────────┘              │
  │  • offer, walk list  │                                       │
  └──────────────────────┘        ┌──────────────────────┐       │
       │        └────────────────▶│ Notification Service │───────┘
       │                          │  APNs / FCM          │
       ▼                          └──────────────────────┘
  ┌───────────────────────────────────────┐
  │ Database:  Rider | Driver | Fare | Ride│
  └───────────────────────────────────────┘
```

**The happy path in one breath** — worth being able to say without looking:

> *"Rider enters pickup and destination → Ride Service calls the mapping API for distance and duration, applies pricing, persists a Fare with a short expiry, returns the quote. Rider accepts → POST /rides with that fareId → Ride Service validates the quote hasn't expired, creates a Ride in MATCHING state, and triggers matching. Meanwhile drivers have been continuously posting location to the Location Service. Matching queries for nearby available drivers, ranks them by real road ETA plus rating and fairness, and offers the ride to the top candidate via push notification with a short acceptance window. On accept, the driver is written onto the ride and the rider is notified; on decline or timeout, it walks to the next candidate."*

**✅ Part I is done: the system works.** Every functional requirement is satisfied. Nothing here scales yet — and that's fine, because you can't sensibly optimize a flow you haven't drawn.

---
---

# PART II — MAKE IT WORK AT SCALE

*Driven by the **non-functional** requirements. Each deep dive names a specific thing that breaks, then walks **bad → good → great**.*

---

<a name="estimation"></a>
# 5. Capacity Estimation — where the numbers bite *(Part 3)*

Numbers are only useful when attached to the decision they force. These four are the ones that do real work:

Assume **~5M concurrent active drivers**, each pinging every **~4 seconds**.

| Number | Value | What it forces |
|---|---|---|
| **Location writes/sec** | 5M ÷ 4 ≈ **~1.25M/s** | A normal database cannot absorb this. → [DD2](#dd2) |
| **Matching queries/sec** | ~100K/min ≈ **~1,700/s** | Low volume, but each is a *2-D proximity search*. Volume isn't the problem; the **query shape** is. → [DD1](#dd1) |
| **Durable trip data** | ~20M trips/day × ~1KB ≈ **~20GB/day** | Genuinely small. Trips are not a scaling problem. |
| **Location storage** | **~0 durable** | Only the *latest* position matters. Storing every ping is pure waste. |

> **The single sentence that carries this section:** *"1.25 million ephemeral writes a second against 1,700 matching reads a second and only 20GB a day of data that actually has to survive. The hottest data in the system is the least durable, and the most durable data is comparatively tiny — so the entire design is about keeping those two apart."*

**Peak matters more than average.** The stated non-functional requirement is *100K requests from the same location* — a concert letting out. That's not 1,700/s spread over the world; it's a spike concentrated on **one geographic area**, which means one shard. That's [DD4](#dd4) and [DD6](#dd6).

---

<a name="dd1"></a>
# 6. Deep Dive 1 — Geospatial index 🎯
### *Driven by: low-latency matching (< 1 min)*

**The question §4.3 hand-waved:** "find available drivers within ~2km of (37.77, -122.41)" — run thousands of times a second against millions of *moving* points.

### ❌ Bad — query lat/lng ranges in the primary database

```sql
SELECT * FROM drivers
WHERE lat BETWEEN 37.75 AND 37.79
  AND lng BETWEEN -122.43 AND -122.39
  AND status = 'available'
```

Two independent failures:
- **A B-tree index only narrows one dimension.** An index on `lat` still leaves the database scanning every row in that latitude band and filtering longitude in memory. There is no single 1-D index that captures "close in 2-D space" — this is a **structural** mismatch, not a tuning problem.
- **Index churn.** At 1.25M location writes/sec every one of those rows is constantly being updated, so any index over them is being rebuilt continuously.

### ⚠️ Good — a database with a built-in geospatial index (MongoDB `2dsphere`, PostGIS)

**You don't implement the spatial algorithm yourself.** Every mainstream database ships one. This tier genuinely solves the read side, and for the large majority of real applications it is the *correct* answer — it only falls short at the specific write volume in this problem.

**MongoDB — `2dsphere`** *(the one to reach for; `2d` is the legacy flat-plane variant, `2dsphere` handles real earth geometry via GeoJSON):*

```js
// 1. index it
db.drivers.createIndex({ location: "2dsphere" })

// 2. store as GeoJSON — note the order: [longitude, latitude]
{ driverId: "driver-101",
  location: { type: "Point", coordinates: [73.8567, 18.5204] } }

// 3. query — nearest-first, within 5km
db.drivers.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [73.8567, 18.5204] },
      $maxDistance: 5000            // metres
    }
  }
})
```
> ⚠️ **`[longitude, latitude]`, not `[lat, lng]`.** GeoJSON reverses the order people say out loud. Silently returns wrong results rather than erroring.

**The mental model — the one idea that matters:**

```
   WITHOUT an index          WITH a geospatial index
   ────────────────          ───────────────────────
   check driver 1            ① narrow to geographically relevant candidates
   check driver 2            ② run precise geometry on ONLY those
   …
   check driver 100,000      →  broad filter first, exact maths afterwards
```

**How to phrase it — and what *not* to say.** Don't claim *"MongoDB divides the map into grids."* That's a simplified mental model, not an accurate description of the implementation, and it invites a follow-up you can't defend. Stay at the level that's true:

> *"MongoDB's geospatial index organises spatial data so a query can quickly narrow to geographically relevant candidates rather than scanning the whole collection. Exact geometric checks are then applied only to those candidates — so queries like nearby, within a radius, or inside a polygon stay efficient."*

**Why it's still not the answer *here*:** it's **disk-backed**, and it's absorbing over a million writes/sec of data we don't even want to keep. Batching the writes helps throughput but **introduces staleness**, and stale locations produce wrong matches — the exact thing this index exists to prevent.

> ⭐ **The distinction to state explicitly, because it's the whole reason DD1 and DD2 are separate deep dives:**
>
> **A geospatial index solves the *query* problem. It does nothing for the *ingestion* problem.** Finding nearby vehicles efficiently and absorbing tens of thousands of location pings every few seconds are two different problems with two different solutions — indexing for the first, queueing/partitioning/write-scaling for the second ([DD2](#dd2)). Candidates routinely answer "use a geospatial index" and think they've addressed both.

**When `2dsphere` *is* the right call:** a fleet-tracking or store-locator system with thousands of entities and modest update rates — i.e. almost every real project. Reach for Redis Geo only when write volume genuinely rules a disk-backed index out. *(Related: [`database/06-mongodb-indexes.md`](../../database/06-mongodb-indexes.md).)*

### ✅ Great — an in-memory geospatial store (Redis)

```
GEOADD    drivers:sf   -122.4194  37.7749   "driver:7"      ← ingest
GEOSEARCH drivers:sf   FROMLONLAT -122.41 37.77
                       BYRADIUS 2 km ASC                    ← proximity query
```

- **In-memory**, so 1.25M writes/sec is comfortable where a disk-backed table isn't.
- **Each write is a blind overwrite** of "driver X's latest position" — no history, no read-modify-write. Cheap and idempotent.
- Internally Redis **geohashes** lat/lng into a 52-bit integer stored in a sorted set, which is what makes a radius query a **range scan** instead of a scan-and-filter.
- **TTL evicts stale drivers automatically** — a driver whose app died stops pinging and disappears from the index within ~30s, with no cleanup job. **Absence of data is the offline signal.**

### The mechanism underneath: geohashing

Worth being able to derive, because Redis's `GEOSEARCH` is doing exactly this and the interviewer may ask you to build it:

**Geohash interleaves the bits of latitude and longitude into one string, so physically near points share a prefix.**

```
San Francisco: 37.7749, -122.4194  →  "9q8yyk8y"
10m away:      37.7750, -122.4190  →  "9q8yyk8z"    ← shares "9q8yyk8"
```

"Nearby" collapses into a **prefix lookup** — cheap and indexable. Precision is just string length:

| Prefix length | Approx cell |
|---|---|
| 5 chars | ~4.9km × 4.9km |
| 6 chars | ~1.2km × 0.6km |
| 7 chars | ~150m × 150m |

**The edge case you must raise unprompted:** a rider standing at a cell boundary may have their closest driver in the *adjacent* cell, invisible to a same-prefix query. **Always query the rider's cell plus its 8 neighbours** (a 3×3 grid).

### Alternative: quad-tree

Recursively split space into 4, subdividing **only where density is high**.

```
World
 ├─ NW ─┬─ subdivide (dense downtown) ─┬─ ...
 ├─ NE
 ├─ SW    (sparse — stays one leaf)
 └─ SE
```

**Trade-off:** geohash cells are **fixed size** regardless of density — wasteful in empty countryside, too coarse in a packed downtown at rush hour. A quad-tree **adapts to density**, giving roughly even driver counts per leaf. The cost is that it's a tree needing rebalancing as density shifts (concerts, rush hour) versus a geohash which is a stateless string computation.

**Pick geohash for simplicity** unless density is extremely uneven. See [§15](#realworld) for where production actually landed and why.

### The failure question you'll get: "what if Redis dies?"

> *"I'd lose the index, but not much else — it holds no durable truth, only the last known position of each driver. With Sentinel or cluster failover plus AOF I limit the loss, but the real answer is that **drivers ping every few seconds, so the index rebuilds itself almost immediately.** Rides in flight are unaffected because they live in the durable database. The tolerable-loss property comes from the data being ephemeral by design — that's the payoff for having separated Location from Driver back in the entity model."*

---

<a name="dd2"></a>
# 7. Deep Dive 2 — Surviving 2M location writes/sec
### *Driven by: high throughput*

Even with the right store, **1.25M pings/sec as individual HTTP requests** is its own problem.

### ❌ Bad — a fresh HTTPS request per ping
TCP handshake + TLS negotiation + HTTP headers per ping, where the payload is ~30 bytes. **The overhead exceeds the data by an order of magnitude**, and it burns driver battery and mobile data.

### ⚠️ Good — persistent connections
Each driver holds a **persistent WebSocket** to a connection server. A ping becomes a small frame on an already-open socket — no handshake, no headers. **Sticky routing** keeps a driver pinned to one connection server for the session.

### ✅ Great — persistent connections **plus adaptive ping frequency**

A fixed 4-second interval is wasteful, because most drivers most of the time aren't doing anything interesting. Let the **client** decide how often to report, using sensors it already has:

| Driver state | Ping rate |
|---|---|
| Parked / stationary | **Rare** — position isn't changing |
| Cruising steadily, no pending offer | Moderate |
| Moving fast, or changing direction | **Frequent** — position is stale quickly |
| En route to a pickup, or has a pending offer | **Frequent** — the rider is watching |

This cuts aggregate write volume substantially **without losing accuracy where accuracy matters**, because the cases that need precision are exactly the cases that get frequent updates.

**The trade-off to name:** the logic now lives on the client, across many app versions you don't control, and a bug there degrades the index in ways that are hard to see server-side. Ship it behind a server-controlled config so the parameters can be changed without an app release.

**And keep the analytics path off the hot path:** anything needing location *history* — trip playback, surge analytics, fraud detection — is fanned out asynchronously to a queue (Parts 13/14) and a separate store. The hot in-memory index stays lean and holds only "latest position."

---

<a name="dd3"></a>
# 8. Deep Dive 3 — Never double-assign a driver
### *Driven by: strong consistency in ride matching*

**The race:** two ride requests near each other compute the *same* driver as their best candidate at nearly the same instant. Both offer. The driver accepts one — or worse, both writes succeed and one rider is silently stranded.

### ❌ Bad — an application-level lock

```java
synchronized (driver) { if (driver.isAvailable()) { assign(); } }
```

Fails outright: there are **many Ride Matching Service instances**. Instance 3's in-process lock is invisible to instance 7. Two machines each believe they hold it. Also loses lock state entirely if the instance crashes.

### ⚠️ Good — a status column with a timeout

Set `driver.status = 'OUTSTANDING_REQUEST'` when offering, back to `AVAILABLE` on decline or after 10s.

Better — the state is shared. **But the timeout lives in the offering instance's memory**: if that instance crashes between offering and timing out, nothing ever resets the status and **the driver is stuck unavailable forever**. You've moved the state out of process but left the *expiry* in it.

### ✅ Great — a distributed lock with TTL

```
SET  lock:driver:{driverId}  {rideId}  NX  EX 10
     NX → only if absent   ← this IS the mutual exclusion
     EX → auto-release     ← this IS the crash-safety
```

- **`NX` makes acquisition atomic** — one operation, not check-then-set, so there is no window between testing and claiming.
- **The TTL matches the 10-second acceptance window**, so the lock expires exactly when the offer does. Crash of the offering service? The lock still releases. **No cleanup job exists because none is needed.**
- Accept → write `Ride.driverId` in the durable database, release the lock. Decline or timeout → TTL expires, driver returns to the pool.
- **Store the `rideId` as the lock value and verify before releasing**, or a late request whose TTL already expired can delete a lock now legitimately held by someone else.

### ⚠️ The caveat that separates a strong answer

**A distributed lock is a performance optimization, not a correctness guarantee.** Redis can lose it — TTL can expire mid-accept, a failover can promote a replica that never saw the write. So the **final assignment write must independently enforce uniqueness**:

```sql
UPDATE rides SET driver_id = :d, status = 'ACCEPTED'
 WHERE ride_id = :r AND driver_id IS NULL;      -- 0 rows → someone won already
```

> *"Redis with SET NX and a TTL is the fast gate that stops virtually all contention from ever reaching the database and gives crash-safe expiry for free. But the database write is what makes double-assignment actually impossible — a conditional update that only succeeds if the ride is still unassigned."*

This is the **same principle** as the atomic conditional inventory update in [Problem 18](problem-18-ecommerce-amazon.md#core) and the Lua-scripted rate-limit check in [Problem 02](problem-02-rate-limiter.md#realworld): **push the condition into the atomic operation instead of checking around it.**

---

<a name="dd4"></a>
# 9. Deep Dive 4 — Never drop a ride request
### *Driven by: high throughput (100K requests from one location)*

A concert ends. 100,000 people open the app in the same minute, in the same place.

### ❌ Bad — match synchronously as requests arrive
The Matching Service is overwhelmed, latency climbs past client timeouts, clients retry, retries add load. **Congestive collapse.** Worse: a crash loses every request currently in flight — and a *paid customer's request vanishing* is far worse than a slow one.

### ✅ Great — a durable queue in front of matching

```
  POST /rides ──▶ [Ride Service] ──▶ ┌──────────────────────────┐
                   (returns 201       │  QUEUE (Kafka / SQS)     │
                    immediately)      │  partitioned by REGION   │
                                      └──────────────────────────┘
                                                 │
                                      [ Matching Service ×N ]
                                       auto-scaled on queue depth
```

Four properties, each earning its place:
- **A spike becomes a backlog, not errors.** The queue absorbs the burst; matching drains at its sustainable rate.
- **Crash safety via offset semantics.** With Kafka, the **consumer offset is not committed until the match completes**. An instance dying mid-match means the offset was never committed, so another instance picks the request up again. *The request cannot be lost.*
- **Queue depth is the autoscaling signal** — a far better trigger than CPU, because it directly measures unserved demand.
- **Partition by region.** A concert in Mumbai fills Mumbai's partition; Delhi's matching is untouched. Without this, one local event degrades matching globally.

**The trade-off to raise yourself:** strict FIFO means one slow request stalls everything behind it. Use a **priority queue** — rides with a driver already nearby, or riders who have been waiting longest, jump ahead. And note the honest limit: **queueing does not create drivers.** If 100K people want rides and 500 drivers exist, the correct behaviour is to fail *fast and clearly* rather than leave people queued in hope — which is exactly what the "< 1 minute to match **or failure**" requirement is asking for.

---

<a name="dd5"></a>
# 10. Deep Dive 5 — The driver who never answers
### *Driven by: "< 1 minute to match **or a definitive failure**"*

The offer goes out. The driver's phone is in their pocket, or their battery died. **Nothing comes back.** Without handling, the ride sits in `MATCHING` forever and the rider stares at a spinner.

The matching workflow is genuinely a **long-running, multi-step, stateful process**:

```
offer d7 → wait 10s → no reply → offer d3 → wait 10s → declined
        → offer d9 → accepted ✓        (or: list exhausted → fail the ride)
```

### ❌ Bad — an in-memory timer
`setTimeout` in the matching instance. Works until that instance restarts, deploys, or crashes — then the ride is orphaned with no timer and no owner.

### ⚠️ Good — a delay queue
Schedule a delayed message (e.g. SQS delay queue) for +10s when offering. When it fires, check whether the ride is still unassigned; if so, offer the next candidate.

Durable, and a real improvement. But **you now hand-manage the state machine**: cancelling pending delayed messages when a driver accepts early, guarding against a stale delayed message re-offering an already-accepted ride, tracking position in the candidate list. That's a pile of edge cases you must get right, and each one is a way to double-assign a ride.

### ✅ Great — a durable execution framework (Temporal, AWS Step Functions)

Model the **entire matching workflow** as a durable process. The framework persists execution state at every step, so the workflow **survives crashes and resumes exactly where it left off**:

```
workflow matchRide(rideId):
    for driver in rankedCandidates:
        acquireLock(driver, ttl=10s)
        sendOffer(driver)
        response = await(accept | decline, timeout=10s)   ← durable wait
        if response == ACCEPT: assign(driver); return
    failRide(rideId, "no drivers available")              ← definitive failure
```

- **Timeouts, retries, and state persistence are the framework's job**, not yours — which removes exactly the edge cases the delay-queue approach forces you to hand-code.
- **The business logic reads like the plain description of the algorithm**, because the durability is infrastructure rather than something threaded through the code.
- The `await` genuinely survives a process restart — the workflow resumes mid-wait on a different machine.

**Trade-off, stated honestly:** it's a substantial new piece of infrastructure with its own operational and learning cost. Justify it by the shape of the problem — *"this is a long-running stateful workflow with timeouts and retries at every step, which is precisely the category durable execution exists for"* — rather than by novelty.

**And close the loop on the requirement:** when the candidate list is exhausted, **fail the ride explicitly and tell the rider**. "< 1 minute to match **or failure**" means a clean failure is a *successful* outcome of this system. An indefinite spinner is the one thing that's actually broken.

---

<a name="dd6"></a>
# 11. Deep Dive 6 — Geo-sharding
### *Driven by: low latency + high throughput*

### ❌ Bad — vertical scaling
Bigger machines. Expensive, needs downtime, finitely available, and still one failure domain. Not a real answer at this scale.

### ✅ Great — shard everything by geography

**A driver in Mumbai is never a valid match for a rider in Delhi.** Geography is an unusually clean shard key — near-zero cross-shard queries in the common case, which almost no other system enjoys.

```
   World ─▶ regions (city / metro)
      │
   ┌──┴──────────────┬──────────────────┬──────────────────┐
   ▼                 ▼                  ▼                  ▼
[Mumbai]          [Delhi]            [NYC]              [London]
 geo index         geo index          geo index          geo index
 matching svc      matching svc       matching svc       matching svc
 queue partition   queue partition    queue partition    queue partition
 (regional DC)     (regional DC)      (regional DC)      (regional DC)
```

- **Two levels of partitioning, working together:** geohash *cells* subdivide space **within** a region for the nearby lookup ([DD1](#dd1)); the *region* is the coarse **shard key across machines**. Same idea applied twice at different granularities.
- **Deploy each region near its users** — the latency budget is spent on matching, not on crossing an ocean.
- **Independent autoscaling.** New Year's Eve in NYC shouldn't force scaling Mumbai's fleet.
- **Boundary queries need scatter-gather.** A rider near a region edge may need a peek at the adjacent shard's edge cells — the same fix as the 8-neighbour geohash problem, one level up.
- **Consistent hashing (Part 24)** to re-split a hot region: carve out a new shard while remapping only the drivers near the new boundary, not the whole region.

---

<a name="dd7"></a>
# 12. Deep Dive 7 — Dynamic (surge) pricing 💰
### *Driven by: the `demand` term §4.1 hand-waved*

This is the capstone deep dive — it **uses everything built so far**: the spatial cells from [DD1](#dd1), the streaming infrastructure from [DD4](#dd4), and the `Fare` entity from [§2](#entities).

## 12.1 First: what surge is actually *for*

The instinct is "charge more when busy = more revenue." **That's the wrong framing and it will cost you the follow-up question.** Surge is a **control loop** that fires in two directions at once:

```
        supply/demand imbalance detected in a cell
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
  RATIONS DEMAND                   REPOSITIONS SUPPLY
  some riders won't pay 2.5x       drivers see the surge zone
  → they wait, walk, or take       → they drive toward it
    transit → fewer requests       → more drivers arrive
        └───────────────┬────────────────┘
                        ▼
              imbalance closes, multiplier falls
```

**Without surge, the network has no mechanism to self-correct.** Demand spikes and the system simply fails to match people — there is no signal telling drivers *where to go*. Surge is how supply learns about demand it can't see.

> **Open with this:** *"Surge isn't primarily a revenue mechanism, it's the network's control loop. It does two things simultaneously — rations demand by pricing out the least urgent riders, and repositions supply by telling drivers where the money is. Without it there's no feedback path from unmet demand back to driver behaviour, and the system just fails to match people during a spike."*

## 12.2 The unit of computation: a cell, over a window

Surge is **not** computed per route, per rider, or per city. It's computed **per spatial cell, per short time window** — the same H3 hexagons from [§15](#realworld) (roughly 0.1–1 sq mile, finer where density is higher), recomputed roughly **every 30–60 seconds**, faster during volatile periods.

The output is a **surge map** — nothing more than a lookup table:

```
   surge_map  =  { cell_id → multiplier }
   { "8a2a1072b59ffff": 1.0,  "8a2a1072b5bffff": 2.3,  ... }
```

… held in a hot key-value store and read by the Ride Service on **every fare quote**. Serving surge is an O(1) cache lookup; *computing* it is the hard part.

## 12.3 What actually counts as "demand"

More subtle than it looks, and this is where depth shows:

| Signal | Why it matters |
|---|---|
| **Ride requests** | Obvious — but a **lagging** indicator. By the time requests spike, riders are already waiting. |
| **Fare-estimate requests / app opens** | ⭐ The **leading** indicator. People check the price *before* committing. This is why FR1's free estimate is more than a UX nicety — **it's the demand telemetry**, and it fires seconds earlier than requests do. |
| **Unfulfilled / timed-out requests** | The **strongest** signal — demand that provably could not be served. |
| **Cancellations after seeing the price** | A **negative** signal: you overshot, and riders are refusing. |

And supply is narrower than "drivers in the cell":
- Drivers **available now** in the cell ✅
- Drivers **finishing a trip that ends in the cell** in the next few minutes ✅ *(soon-to-be supply — omitting these makes you over-surge)*
- Drivers **mid-trip heading elsewhere** ❌ — they are not supply here

**The multiplier** is then a function of the smoothed supply/demand ratio, thresholded and capped — not a raw instantaneous ratio (see [12.5](#dd7)).

## 12.4 The pipeline — and it's a shape you've already seen

```
  [location pings] [ride requests] [fare-estimate requests] [cancellations]
            │              │                │                     │
            └──────────────┴────────┬───────┴─────────────────────┘
                                    ▼
                     ┌───────────────────────────────┐
                     │  KAFKA  — partitioned by region│
                     └───────────────────────────────┘
                                    │
                     ┌───────────────────────────────┐
                     │  FLINK — windowed aggregation  │
                     │  GROUP BY (cell_id, window)    │
                     │  supply/demand → multiplier    │
                     └───────────────────────────────┘
                                    │  every ~30–60s
                                    ▼
                     ┌───────────────────────────────┐
                     │  SURGE MAP  (Redis / hot KV)   │
                     │  cell_id → multiplier          │
                     └───────────────────────────────┘
                                    │  O(1) lookup
                                    ▼
                     [ Ride Service ]  on every POST /fare
```

Uber's published description matches this: streaming data from **Kafka**, an ML-based algorithm in **Flink**, results written to a **key-value sink for fast lookup**.

### ⭐ The lateness decision — and why it's the *opposite* of Problem 19

This is the single best cross-link in the folder. Structurally, surge pricing is **the same pipeline as [Problem 19 (ad click aggregation)](problem-19-ad-click-aggregator.md)** — high-volume events, event-time windowed aggregation, served from a hot store. But the **lateness policy is inverted**:

| | **Surge pricing** | **Ad click aggregation** |
|---|---|---|
| Late-arriving event | **Dropped.** Does not contribute. | **Must be folded in**, via grace period + batch reconciliation |
| Priority | **Freshness & availability over consistency** | **Completeness & exactness over freshness** |
| Why | A late event would revise a price that was already quoted and acted on. **A stale surge number is worse than a slightly incomplete one** — it's simply wrong about *now*. | A dropped click is **revenue that permanently vanished**, and the advertiser audits the invoice. |

> **Say this and it lands:** *"It's the same streaming shape as an ad-click aggregator, but the lateness policy is inverted. Surge favours freshness over completeness and simply drops late events, because a surge number is a statement about **right now** — revising a price that's already been quoted is useless. Billing aggregation is the reverse: it holds windows open and reconciles from raw, because a dropped click is revenue that's gone forever. Same pipeline, opposite policy, and the reason is just which kind of wrong costs more."*

## 12.5 The four ways it goes wrong

This is where the real depth is — a naive ratio-and-threshold implementation fails in four specific, nameable ways.

### ① Oscillation — the feedback loop eating itself
Surge is a control loop, and control loops oscillate:

```
   multiplier ↑  →  drivers flock to the cell  →  supply spikes
        ↑                                              │
        │                                              ▼
   drivers leave  ←  multiplier crashes to 1.0  ←  over-supply
```

Riders get whipsawed and drivers chase a number that's gone by the time they arrive — which actively destroys driver trust.

**Fixes, borrowed straight from control theory:**
- **Hysteresis** — different thresholds for *raising* vs *lowering*. Easy to go up at ratio 1.5, only come down below 1.2. Removes flapping at the boundary.
- **Smoothing** — an EWMA over several windows rather than the instantaneous ratio.
- **Rate-limit the multiplier's movement** — cap how much it can change per window, so it ramps instead of stepping.
- **Account for in-flight supply** — drivers *en route to* the surge zone should already count as supply, or you keep surging for demand that's about to be met. This is the biggest single fix, because it closes the loop early.

### ② Boundary cliffs
Adjacent cells with very different multipliers means **the price changes when you cross a street.** This is real and observable — riders learn to walk one block to save 40%, which is a legible fairness problem, not just an artifact.

**Fix: blend with neighbouring cells**, weighting by distance, so the price surface is smooth rather than a step function. **This is where H3's uniform neighbour distance genuinely earns its keep** ([§15](#realworld)): blending across 6 equidistant neighbours is well-defined, whereas across 8 square neighbours at two different distances the weights are arbitrary.

### ③ The quote must lock the multiplier — ⭐ the payoff of §2
The surge map updates every ~30 seconds. A rider takes 45 seconds to decide. If the price were recomputed at request time, **they'd be charged something different from the number they tapped.**

**This is exactly why the `Fare` entity is persisted with a TTL** ([§2](#entities), [§4.1](#hld1)). The Fare **snapshots the multiplier at quote time**, and `POST /rides {fareId}` redeems that snapshot. The short TTL is the other half: it stops a rider sitting on a 1.0× quote and redeeming it twenty minutes later at 2.5×.

> A design decision made in Part I for one reason turns out to be load-bearing for a feature designed three sections later. **Say that out loud in an interview** — "and this is why I persisted the Fare rather than recomputing" — it demonstrates the design is coherent rather than assembled.

### ④ Cold start / sparse cells
A rural cell with 2 drivers and 1 request has a supply/demand "ratio" that is **statistically meaningless** — one extra request doubles it and the multiplier goes wild on pure noise.

**Fixes:**
- **Minimum-volume threshold** — no surge at all below N events in the window.
- **Fall back to a coarser resolution** — H3 is *hierarchical* precisely for this: aggregate up to the parent cell until there's enough signal. The hierarchy is not decoration, it's the cold-start mechanism.
- **Cap the multiplier**, always.

## 12.6 Three more things worth naming

- **Predictive, not just reactive.** A purely reactive system is always late — it responds *after* riders are already waiting. A stadium emptying at 22:30 is **on the calendar**; so are rush hour, bad weather, and flight arrivals. Forecast known demand and **pre-position drivers before the spike**, using reactive surge only for the residual. Best systems run both.
- **Caps and regulation are a hard requirement, not a nicety.** Multipliers are capped, and in many jurisdictions surge is **legally restricted during emergencies and disasters**. A pricing service that can't cap or disable surge per-region is a compliance failure, not a missing feature — so region-scoped policy overrides belong in the design.
- **Rider-side price and driver-side incentive need not be the same number.** Many systems decouple them — the driver receives a flat repositioning bonus rather than the rider's multiplier. That decoupling is what lets you incentivize supply into a zone *without* raising rider prices, which matters a great deal when the alternative is a PR problem.

---

<a name="db"></a>
# 13. Database — consolidated *(Part 8)*

Three access patterns, three stores. **The defining trait: the hottest data is the least durable.**

| Data | Pattern | Store | Why |
|---|---|---|---|
| **Live driver location** | ~1.25M writes/s, latest-value-only, no durability needed | **In-memory geo index** (Redis Geo), sharded by region | Ephemeral by design; TTL is the offline signal ([DD1](#dd1), [DD2](#dd2)) |
| **Rides** | Written a handful of times per trip, read for history/receipts | **NoSQL** (Cassandra/DynamoDB), sharded by `rideId` | Key lookup, huge volume, no joins |
| **Fares** | Write-once, read-once, expire | Same store, short TTL | A quote, not a record |
| **Driver / Rider profiles** | Rarely written, read on every match | SQL or NoSQL + **cache-aside** (Part 5) | Classic read-heavy hot data |
| **Location history** | Bulk, offline | Async queue → analytics store | Never on the hot path ([DD2](#dd2)) |

> **The mistake to name:** forcing location pings through the same database as ride records. It's the single most common failure in this design, and it's why `Location` was separated from `Driver` back in [§2](#entities).

---

<a name="arch"></a>
# 14. Final architecture

Part I's flow, with Part II's machinery in place. **★ marks what Part II added.**

```
   [Rider App]                                            [Driver App]
       │                                                     │      ▲
       │ ①POST /fare  ②POST /rides  ⑤WS status               │      │ ④ push offer
       ▼                                       ③ location ping (WS ★, adaptive rate ★)
   ┌──────────────────── API Gateway ─────────────────────┐  │      │
   │              authN · rate limit · WS-aware ★          │  │      │
   └───────────────────────────────────────────────────────┘  │      │
       │                        │                             ▼      │
       ▼                        │              ┌───────────────────────────┐
  ┌──────────────┐   ┌──────────────────┐      │ Connection Servers ×N ★   │
  │ Ride Service │──▶│  Mapping API     │      │  sticky, persistent WS    │
  └──────────────┘   └──────────────────┘      └───────────────────────────┘
       │                                                    │ blind overwrite
       │ ★ enqueue, don't match inline                       ▼
       ▼                                        ┌───────────────────────────┐
  ┌──────────────────────────┐                  │ REDIS GEO INDEX ★         │
  │ QUEUE (Kafka) ★          │                  │ GEOADD / GEOSEARCH        │
  │ partitioned by REGION ★  │                  │ TTL evicts stale drivers  │
  │ offset committed only    │                  │ sharded by REGION ★       │
  │ after match completes ★  │                  └───────────────────────────┘
  └──────────────────────────┘                        ▲          │
       │  autoscale on queue depth ★                  │          │ async ★
       ▼                                              │          ▼
  ┌────────────────────────────────────┐              │   ┌──────────────────┐
  │ Ride Matching Service ×N           │──────────────┘   │ Analytics store  │
  │  ★ runs as a DURABLE WORKFLOW      │  query nearby    │ (location history)│
  │    (Temporal / Step Functions)     │                  └──────────────────┘
  │  • rank by road ETA, rating, fair  │
  │  • SET NX lock (TTL=10s) ★         │─────────┐
  │  • offer → await 10s → next        │         │
  │  • list exhausted → FAIL the ride  │         ▼
  └────────────────────────────────────┘   ┌──────────────────────┐
       │                                   │ Notification Service │
       │ conditional UPDATE ★              │  APNs / FCM          │
       │ WHERE driver_id IS NULL           └──────────────────────┘
       ▼
  ┌────────────────────────────────────────────────────────┐
  │ Database — sharded by region ★, replicated             │
  │   Rider | Driver | Fare | Ride                         │
  └────────────────────────────────────────────────────────┘
```

**Read path (matching):** request → queue (regional) → matching workflow → Redis geo query (own cell + 8 neighbours) → rank by road ETA → `SET NX` lock → push offer → conditional DB update on accept.
**Write path (location):** driver ping (adaptive rate) → persistent WS → connection server → blind overwrite into regional Redis geo index → async fan-out to analytics.
**Pricing path (§12):** all events → Kafka → **Flink windowed aggregation per (cell, window)** → **surge map in Redis** → Ride Service reads it on every fare quote and **snapshots the multiplier into the Fare**.

```
   ── SURGE PIPELINE ★ (§12) ────────────────────────────────────────────────
     [ride requests] [fare-estimate requests] [location] [cancellations]
                              │
                              ▼
              [ KAFKA — partitioned by region ]
                              │
              [ FLINK — window agg by (cell, window) ]
                 smoothing · hysteresis · caps · neighbour blending
                 late events DROPPED (freshness > completeness)
                              │  every ~30–60s
                              ▼
              [ SURGE MAP — Redis:  cell_id → multiplier ]
                              │  O(1) lookup on POST /fare
                              ▼
                      [ Ride Service ] ── snapshots multiplier into Fare
   ──────────────────────────────────────────────────────────────────────────
```

---

<a name="realworld"></a>
# 15. How the real system does it 🌐

[DD1](#dd1) offers geohash and quad-tree. Production evolved past both, to **H3 — a hexagonal hierarchical spatial index** — and *why hexagons* is a natural follow-up with a concrete answer.

### Why hexagons

**① Uniform neighbour distance.** A hexagon has **exactly 6 neighbours, all centroids equidistant.** A square has 8 neighbours at **two different distances** — 4 edge-adjacent, 4 diagonal at ~1.41×. That inconsistency matters for the operation this system runs constantly: expanding outward to find nearby drivers. With hexagons, "one ring outward" is a uniform distance. **This directly cleans up DD1's 3×3 / 8-neighbour workaround — with hexagons it's 6, and they're genuinely equidistant.**

**② Better circular approximation.** Real queries are circular — "drivers within 2km," "surge zone." A hexagon approximates a circle noticeably better than a square, so less area is wasted on corners inside the cell but outside the radius.

**③ Uniform cell area → comparable aggregates.** Geohash cells **distort with latitude** — a 5-char cell near the equator and one near the poles are very different real areas. For Uber this isn't academic: **surge pricing and supply–demand are computed per cell**, so cells that aren't comparable produce prices that aren't comparable.

### The honest caveat
**Hexagons don't tile hierarchically without error.** A hexagon can't be perfectly subdivided into smaller hexagons the way a square splits into four; H3's finer resolutions only *approximately* nest. It also needs **12 pentagons** to cover a sphere at all — you cannot tile a sphere with hexagons alone.

That trade is the interesting part: **geohash gives exact hierarchical nesting with distorted cells; H3 gives uniform, well-behaved cells with approximate nesting.** Uber chose the second because its dominant operations are proximity and aggregation, not exact containment.

### What to actually do in an interview
**Design with geohash or a quad-tree** — simpler to explain and derive live; nobody expects H3 on a whiteboard. Mention H3 as **where production went and why**, which shows you know the limits of what you just designed. Design the simple thing, name the sophisticated thing, explain the gap.

---

<a name="interview"></a>
# 16. Interview Q&A

### Q: "Walk me through what happens when I open the app and request a ride."
> *"You enter pickup and destination, which hits the Ride Service. It calls a third-party mapping API for road distance and duration — I'm not building routing — applies a pricing model, and persists a Fare with a short expiry, returning you a quote. Nothing is reserved at that point; estimates are free and far more common than bookings. When you accept, the client posts the fareId — not a price, so it can't be tampered with — and the service validates the quote hasn't expired, creates a Ride in MATCHING state, and triggers matching asynchronously, returning immediately. Matching queries the geospatial index for nearby available drivers, ranks them by real road ETA plus rating and fairness, and offers to the top candidate via push notification with a ten-second window. On accept, the driver is written onto the ride; on decline or timeout it walks the list. If the list runs out, the ride fails explicitly rather than hanging."*

### Q: "Why is Fare a separate entity? Why not just compute the price when the ride is requested?"
> *"Because then the price could change between what you were shown and what you agreed to — traffic shifts, surge kicks in — and you'd be charged something other than the number you tapped. Persisting the Fare makes the quote binding: the ride references that fareId. It also means the client never sends a price, only a reference to one the server issued, which closes the obvious tampering hole. And the Fare gets a short TTL, or someone could sit on an off-peak quote and redeem it during surge."*

### Q: "How do you find nearby drivers efficiently?"
> *"Not with a lat/long range query against the primary database — a B-tree index only narrows one dimension, so it still scans that band and filters the other in memory, and at over a million location writes a second the index churn alone would kill it. I'd use an in-memory geospatial store, Redis with GEOADD and GEOSEARCH. Underneath it geohashes lat/long into a single sorted-set key, which turns a proximity query into a range scan. The edge case I'd call out is boundaries — a rider at a cell edge may have their closest driver in the adjacent cell — so I always query my cell plus its eight neighbours."*

### Q: "1.25 million location writes per second. How does that not destroy your database?"
> *"It never touches the durable database. Locations are ephemeral — I only need each driver's latest position, never history — so they live in an in-memory index and every write is a blind overwrite, no read-modify-write. Drivers push over a persistent WebSocket rather than opening a connection per ping, since at that frequency the handshake costs more than the payload. And I'd make the ping rate adaptive on the client: a parked driver reports rarely, one moving fast or en route to a pickup reports frequently. That cuts volume substantially without losing accuracy where it matters. Anything needing history goes async to a separate analytics store."*

### Q: "Two riders get matched to the same driver at the same instant. What stops the double-assignment?"
> *"An in-process lock is useless because there are many matching instances. A status column with an in-memory timeout is better but leaves the driver stuck unavailable forever if the instance holding the timer crashes. So I'd use a distributed lock — SET NX with a TTL equal to the ten-second acceptance window. NX makes acquisition atomic so there's no gap between checking and claiming, and the TTL means the lock releases even if the service dies, so there's no cleanup job. But I'd be explicit that the lock is a fast gate, not the correctness guarantee — Redis can lose it to a failover or an expiry mid-accept — so the final write is a conditional update that only sets driver_id where it's still null. The lock keeps contention off the database; the database is what makes double-assignment impossible."*

### Q: "A concert ends. 100,000 requests from one location. What happens?"
> *"Synchronous matching collapses — latency crosses client timeouts, clients retry, retries add load. So ride requests go onto a durable queue and matching consumes from it, which turns a spike into a backlog instead of errors. With Kafka the consumer offset isn't committed until the match completes, so an instance dying mid-match means another picks the request up rather than losing it. I partition the queue by region so a Mumbai concert doesn't degrade Delhi, and autoscale on queue depth, which measures unserved demand directly rather than proxying it through CPU. Strict FIFO would let one slow request stall the rest, so I'd prioritize by proximity and wait time. The honest limit is that queueing doesn't create drivers — if there are 500 drivers for 100,000 riders, the right behaviour is to fail quickly and clearly, which is exactly what the sub-one-minute-to-match-or-failure requirement asks for."*

### Q: "The driver's phone is in their pocket. They never respond. Then what?"
> *"That has to resolve, or the rider watches a spinner forever. A setTimeout in the matching instance dies with the instance. A delay queue is durable but leaves me hand-managing the state machine — cancelling pending messages when someone accepts early, guarding against a stale message re-offering an already-assigned ride. What this actually is, is a long-running stateful workflow with a timeout and a retry at every step, so I'd model it with a durable execution framework like Temporal or Step Functions. The framework persists state at each step, so the ten-second await genuinely survives a restart and resumes on another machine, and the business logic reads like the plain algorithm. The cost is real new infrastructure, so I'd justify it by the workflow shape rather than novelty. And when the candidate list is exhausted, I fail the ride explicitly and tell the rider — a clean failure is a successful outcome here."*

### Q: "Why push notifications? You already have a WebSocket to the driver."
> *"Because the socket only exists while the app is in the foreground. Once the driver backgrounds the app the OS suspends it and the socket is gone, and that's the normal state between rides — a driver isn't staring at the screen. A push notification through APNs or FCM is what wakes the app. So I'd use both: the live socket as the fast path when the app is foregrounded, push as the wake mechanism otherwise. Saying only 'push it down the socket' leaves the most common case broken."*

### Q: "How do you scale this globally?"
> *"Geography is an unusually clean shard key — a driver in Mumbai is never a candidate for a rider in Delhi, so there are essentially no cross-shard queries in the common case. Each region gets its own geospatial index, matching service, queue partition, and ideally a data centre near its users. Within a region I still use geohash cells for the fine-grained lookup, so it's two levels of partitioning: cells subdivide space within a shard, regions shard across machines. Boundary riders need a scatter-gather peek at the adjacent shard — the same fix as the eight-neighbour problem one level up. And if a region gets hot I can split it, with consistent hashing so only the drivers near the new boundary get remapped."*

### Q: "Could you just use MongoDB for this? Doesn't it have geospatial support?"
> *"Yes, and for most real systems that would be my answer. I'd put a 2dsphere index on the location field, store positions as GeoJSON points — longitude first, which trips people up — and query with $near and a $maxDistance. The value is that I'm not implementing the spatial algorithm myself: the index narrows the query to geographically relevant candidates instead of scanning the collection, and exact geometric checks run only on those. Broad filter first, precise maths afterwards. The reason I wouldn't use it as the primary index **here specifically** is the write side, not the read side — it's disk-backed and I'm absorbing over a million location writes a second for data I don't even want to keep, and batching those writes to cope would introduce staleness, which produces wrong matches. So Redis in memory. But I'd be clear that's a decision forced by this particular write volume — for a fleet-tracking system with thousands of vehicles, 2dsphere is the right call."*

### Q: "So the geospatial index solves your scaling problem?"
> *"Only half of it, and I'd want to separate the two explicitly. A geospatial index solves the **query** problem — finding nearby vehicles without scanning everything. It does nothing at all for the **ingestion** problem — absorbing tens of thousands of location pings every few seconds. Those need different tools: indexing for the first, and queueing, partitioning, and write-scaling for the second. They get conflated a lot, because 'use a geospatial index' sounds like a complete answer to 'how does this scale' and it's only half of one."*

### Q: "How does the app decide there's too much demand on a route and raise the fare?"
> *"First, framing: surge isn't primarily a revenue mechanism, it's the network's control loop. It rations demand by pricing out the least urgent riders and simultaneously repositions supply by telling drivers where to go — without it there's no feedback path from unmet demand back to driver behaviour. Mechanically it's computed per spatial cell per short time window, not per route or per city: the same hexagonal cells I use for matching, recomputed every thirty to sixty seconds. Demand isn't just ride requests — those lag, because by then people are already waiting. The leading indicator is fare-estimate requests, people checking the price before they commit, which is one reason that free-estimate endpoint matters beyond UX. I'd also weight unfulfilled requests heavily, since that's demand that provably couldn't be served. Supply is available drivers plus drivers finishing a trip that ends in the cell — omitting that soon-to-be supply makes you over-surge. Then it's a streaming pipeline: events into Kafka, windowed aggregation in Flink grouped by cell, output a surge map of cell to multiplier into Redis, and the Ride Service does an O(1) lookup on every quote."*

### Q: "What stops surge pricing from oscillating?"
> *"It's a control loop, so it will oscillate if you implement it naively — the multiplier rises, drivers flock in, supply spikes, the multiplier crashes, drivers leave, and it rises again. Riders get whipsawed and drivers chase a number that's gone by the time they arrive, which destroys driver trust. Four fixes, mostly borrowed from control theory. Hysteresis — different thresholds for going up versus coming down, so it doesn't flap at the boundary. Smoothing with an EWMA across several windows instead of the instantaneous ratio. Rate-limiting how far the multiplier can move per window so it ramps rather than steps. And the biggest one: count drivers already en route to the surge zone as supply, because otherwise you keep surging for demand that's about to be met — that closes the loop early. I'd also blend with neighbouring cells, otherwise the price changes when you cross a street and riders learn to walk one block, which is a fairness problem rather than just an artifact."*

### Q: "The surge multiplier changed while I was deciding. What am I charged?"
> *"What you were quoted — and this is exactly why the Fare is a persisted entity rather than a price computed at request time. The surge map updates every thirty seconds or so and a rider takes longer than that to decide, so recomputing at request time would charge you something different from the number you tapped. The Fare snapshots the multiplier at quote time and POST /rides redeems that snapshot by fareId. The short TTL on the Fare is the other half of it — it stops someone sitting on a 1.0x quote and redeeming it twenty minutes later during a 2.5x surge. It's a decision I made in the flow section for a different reason that turns out to be load-bearing for pricing."*

---

<a name="cheatsheet"></a>
# 17. Cheat Sheet

**Structure of the answer:** flow first (functional), then deep dives (non-functional). Don't optimize a flow you haven't drawn.

**Part I — the flow**
- **Entities:** Rider · Driver · **Fare** · Ride · **Location**. Two decisions live here: `Fare` is a **binding quote** created before the Ride (client sends `fareId`, never a price); `Location` is **separate from Driver** (~1000× the write volume, zero durability) — merging them is the classic mistake.
- **API:** `POST /fare` → `POST /rides {fareId}` → `POST /drivers/location` (**driverId from JWT, never the body**) → `PATCH /rides/{id} {ACCEPT|DECLINE}`.
- **Build order:** ① fare (Gateway, Ride Svc, Mapping API, DB) ② request (+ Ride table, async trigger) ③ match (+ Driver Client, Location Svc, Matching Svc) ④ accept (+ Notification Svc). **Every box exists because a requirement forced it.**
- **Buy the routing** (mapping API). **Navigation is on-device.** **Offer, don't assign.**

**Part II — the deep dives (one per non-functional requirement)**
- **Estimate:** ~**1.25M location writes/s** vs ~**1,700 matching/s** vs ~**20GB/day** durable. *Hottest data is least durable.*
- **DD1 geo index:** ❌ lat/lng range query (B-tree is 1-D; index churn) → ⚠️ **built-in geospatial index — MongoDB `2dsphere` / PostGIS** (fixes reads, not writes) → ✅ **Redis GEOADD/GEOSEARCH**, TTL evicts stale drivers (**absence = offline**).
  - **MongoDB:** `createIndex({location:"2dsphere"})` · store GeoJSON `{type:"Point", coordinates:[lng,lat]}` ⚠️ **lng first** · query `$near` + `$geometry` + `$maxDistance` (metres). Model = **broad filter to relevant candidates → precise geometry on those only**. ⚠️ **Don't say "it divides the map into grids"** — say *"organises spatial data so it narrows to geographically relevant candidates, then applies exact geometric checks."*
  - ⭐ **Index solves the QUERY, not the INGESTION.** Nearby-search = indexing; tens of thousands of pings/sec = queueing/partitioning/write-scaling (DD2). Two problems, two solutions — conflating them is the common miss.
  - **`2dsphere` is the right answer for most real systems** (fleet tracking, store locator); Redis Geo only when write volume rules out a disk-backed index. Geohash = prefix sharing; **query cell + 8 neighbours**. Quad-tree = density-adaptive, needs rebalancing. *Redis dies → index rebuilds in seconds because pings are constant.*
- **DD2 write volume:** ❌ HTTP per ping → ⚠️ persistent WS → ✅ **+ adaptive ping rate** (parked = rare, moving/en-route = frequent). History goes async, never on the hot path.
- **DD3 consistency:** ❌ in-process lock (many instances) → ⚠️ status column (timeout dies with the instance → driver stuck forever) → ✅ **`SET NX EX 10`** (NX = atomic claim, TTL = crash-safety, no cleanup job). **⚠️ The lock is a fast gate, NOT the guarantee** — final `UPDATE ... WHERE driver_id IS NULL` is what makes it impossible.
- **DD4 throughput:** ❌ sync matching (congestive collapse) → ✅ **durable queue**, partitioned **by region**, **offset committed only after match** (crash → replay, never lost), **autoscale on queue depth**, priority not strict FIFO. *Queueing doesn't create drivers — fail fast when supply is gone.*
- **DD5 no response:** ❌ `setTimeout` → ⚠️ delay queue (durable, but you hand-manage the state machine) → ✅ **durable execution** (Temporal/Step Functions) — `await` survives restarts, logic reads like the algorithm. **Exhausted list → fail explicitly.** A clean failure is a *success*.
- **DD6 sharding:** shard by **region** (geography = near-zero cross-shard). **Two levels:** geohash cells *within*, region *across*. Boundary = scatter-gather. Consistent hashing to re-split a hot region.
- **DD7 dynamic (surge) pricing 💰:** **it's a control loop, not a revenue lever** — rations demand *and* repositions supply; without it the network can't self-correct.
  - **Unit:** per **cell**, per **window** (~30–60s) → a **surge map** `cell_id → multiplier` in a hot KV, O(1) lookup on every quote.
  - **Demand signals:** ride requests (*lagging*) · **fare-estimate requests (*leading* — the free estimate is demand telemetry)** · unfulfilled requests (*strongest*) · cancellations (*negative*). **Supply = available + finishing-a-trip-in-cell** (omitting the latter → over-surge).
  - **Pipeline:** Kafka → **Flink windowed agg by (cell, window)** → surge map → Redis. ⭐ **Same shape as [Problem 19](problem-19-ad-click-aggregator.md), opposite lateness policy** — surge **drops** late events (freshness > completeness); billing **must** fold them in (completeness > freshness).
  - **4 failure modes:** ① **oscillation** → hysteresis + EWMA + rate-limit + **count en-route drivers as supply** ② **boundary cliffs** → blend neighbouring cells (*H3's equidistant neighbours make this well-defined*) ③ **quote must lock the multiplier** → ⭐ *this is why `Fare` is persisted with a TTL* ④ **sparse cells** → min-volume threshold + **fall back to a coarser H3 resolution** (that's what the hierarchy is for) + cap.
  - Also: **predictive** (stadium empties at 22:30 — it's on the calendar) not just reactive · **caps + per-region disable are a compliance requirement** · rider price ≠ driver incentive (decouple them).
- **Push notifications (APNs/FCM) are required** — a backgrounded app has no socket, and that's the normal between-rides state.

**Real world (§15):** H3 hexagons — **6 equidistant neighbours** (vs 8 at two distances), better circle fit, **uniform area so per-cell surge pricing is comparable**. Caveat: hexagons **don't nest exactly** and a sphere needs **12 pentagons**. Design with geohash, name H3.

**Cross-refs:** Problem 17 (batching vs matching — the contrast), Problem 18 (§4 same atomic-conditional-write principle), Problem 02 (§10.5 same push-the-condition-into-the-atomic-op), Part 26 (WebSockets/sticky LB), Part 24 (consistent hashing), Parts 13/14 (queue, async).

*— Design Problem 10 complete —*
