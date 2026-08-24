# Design Problem 17 — Food Delivery (Swiggy / Zomato)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 13, 14, 21, 25, 26.
>
> **Signature challenge:** **batched dispatch in a three-sided marketplace** — one rider carries multiple orders, and the assignment must be timed against a *predicted restaurant prep time* so the rider doesn't idle at the counter or arrive after the food goes cold.
>
> **Read [`problem-10-uber-ride-sharing.md`](problem-10-uber-ride-sharing.md) first.** This problem reuses its geospatial index wholesale. Everything *new* here comes from the fact that food delivery is **not** "Uber for food" — see §1.

---

## Table of Contents

1. [Requirements — why this isn't Uber](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: batched dispatch + prep-time-aware assignment](#core)
5. [ETA — a sum of three predictions](#eta)
6. [Restaurant discovery & search](#search)
7. [Order lifecycle — the saga](#order)
8. [Database](#db)
9. [Scaling](#scaling)
10. [Full architecture](#arch)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements — why this isn't Uber *(Part 1)*

**Functional:**
1. Customer browses **nearby, currently-open** restaurants and searches dishes.
2. Customer places an order; restaurant accepts and begins preparing.
3. System assigns a **delivery partner**, possibly **batching** this order with others.
4. Live tracking of order state and rider location; ETA shown and updated.
5. Payment, ratings, refunds.

**Non-functional:**
- **Assignment latency** — a partner should be assigned within seconds, but *timed* so they reach the restaurant as the food is ready.
- **High availability** at meal-time peaks — traffic is extremely spiky (lunch ~12–2pm, dinner ~7–10pm carry the majority of daily volume).
- **ETA accuracy** — the single biggest driver of customer trust; a wrong ETA is worse than a longer honest one.
- **Fleet efficiency** — the delivery network is the dominant cost. Orders-per-rider-hour is the metric the whole dispatch design optimizes.

### The four differences that change the design

This is the part that separates a good answer from "it's Uber with restaurants":

| | **Uber (Problem 10)** | **Food delivery (this)** |
|---|---|---|
| **Sides** | Two — rider ↔ driver | **Three** — customer ↔ restaurant ↔ rider. The restaurant is an independent actor with its own capacity and its own accept/reject. |
| **Assignment cardinality** | **1 : 1** — one driver, one rider, exclusive | **1 : N — batching.** One rider carries 2–4 orders on one trip. This is an *optimization* problem, not a matching problem. |
| **Timing** | Match **now**, driver drives **now** | **Deliberately delayed.** Assigning instantly makes the rider wait 15 min at the counter — dead fleet capacity. Assignment must be timed against predicted prep completion. |
| **ETA** | One leg: driver → rider | **Three legs summed:** prep time + rider→restaurant + restaurant→customer, each with its own uncertainty. |

> **Say this out loud in the interview:** "the core difference from ride-sharing is that this is a batching and scheduling problem, not a matching problem — and the third party, the restaurant, injects a prediction (prep time) that the whole dispatch decision hangs off."

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume a large India-scale platform: **~5M orders/day**.

- **Average orders/sec:** 5M ÷ 86,400 ≈ **~58/s** — genuinely low. Orders are *not* the scaling problem.
- **Peak is everything:** ~70% of volume lands in ~4 hours of meal peaks → 3.5M ÷ 14,400s ≈ **~240/s sustained peak**, with minute-level bursts well above that. **Peak/average ratio ≈ 4–5×.**
- **Riders:** ~300K active partners, pinging location every **5s** → 300K ÷ 5 ≈ **~60K location writes/sec**. *This* is the high-volume path (same shape as Uber, ~20× smaller).
- **Browse/search traffic:** every order is preceded by heavy browsing — assume **~50 restaurant-list/search requests per order** → ~58 × 50 ≈ **~3,000 reads/sec average, ~12,000/s at peak**. **Reads outnumber orders ~50:1.**
- **Storage:** 5M orders/day × ~2KB ≈ **~10GB/day** order data — small. Media (restaurant/dish images) dominates raw bytes and goes to object storage + CDN (Part 2.7).

> The estimation reframes the problem: **write volume is location pings, read volume is browsing, and the actual orders are a rounding error numerically but carry all the correctness requirements.** Optimize the browse path with caching and the dispatch path for quality-of-assignment — not for order throughput.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
GET  /api/v1/restaurants?lat=&lng=&cursor=
→ 200 { "items": [{ "id", "name", "rating", "etaMin", "isOpen", "distanceKm" }], "nextCursor" }

GET  /api/v1/search?q=biryani&lat=&lng=
→ 200 { "restaurants": [...], "dishes": [...] }

POST /api/v1/orders
Headers: Idempotency-Key: <UUID>          ← same discipline as Problem 16
Body: { "restaurantId", "items": [...], "addressId", "paymentMethod" }
→ 201 { "orderId", "status": "PENDING_RESTAURANT_ACCEPT", "etaMin": 34 }

GET  /api/v1/orders/{orderId}
→ 200 { "status", "riderLocation": {lat,lng}, "etaMin", "timeline": [...] }

WS   server → customer : { "orderId", "status", "riderLocation", "etaMin" }
WS   rider  → server   : { "riderId", "lat", "lng", "ts" }        (every ~5s)

# Restaurant-facing
POST /api/v1/partner/orders/{orderId}/accept   Body: { "prepTimeMin": 18 }
POST /api/v1/partner/orders/{orderId}/ready
```

**Design notes:**
- **`etaMin` is returned at order creation and then continuously revised** over the WebSocket. A single ETA fixed at checkout will be wrong; the contract must allow it to move.
- **The restaurant declares `prepTimeMin` on accept** — but treat it as *one input to the model*, not the truth (§5). Restaurants systematically under-report when busy.
- **Customer tracking is push, not poll** (Part 26). Rider location updates are **throttled to ~one every 10s** on the customer-facing side even though riders ping every 5s — the customer cannot perceive the difference, and it halves the fan-out.

---

<a name="core"></a>
# 4. Core: batched dispatch + prep-time-aware assignment 🎯

Three decisions, in order. Getting the *order* right is most of the answer.

```
   ①  WHEN to assign        (timing — against predicted prep completion)
   ②  WHICH orders to batch (grouping — which orders ride together)
   ③  WHICH rider gets it   (selection — from the geospatial candidate set)
```

### ① When to assign — the delayed-dispatch insight

Naive: assign a rider the instant the order is placed. Result: the rider arrives in 6 minutes, the food is ready in 18, and the rider **idles at the counter for 12 minutes**. Across a fleet, that idle time is the single largest waste of delivery capacity.

Correct: assign so the rider arrives **just as the food is ready**.

```
  t=0    order placed, restaurant accepts, predicted prep = 18 min
  t=?    ASSIGN — chosen so that (assign → reach restaurant) lands at t≈18
         if predicted travel-to-restaurant = 7 min  →  assign at t ≈ 11
  t=18   rider arrives, food ready, immediate pickup   ← target
```

This deliberately **holds the order in a dispatch queue** for a computed delay. That's counter-intuitive and it's exactly what a strong answer surfaces.

**The safety margin:** you don't target *exactly* t=18, you target slightly early (say t=16), because the asymmetry is brutal — a rider arriving 2 min early costs 2 minutes of one rider's time; a rider arriving 5 min late means the food sits getting cold and every downstream order in that batch slips. **Bias early.**

### ② Which orders to batch

One rider carrying 3 orders roughly triples that rider's throughput — but only if the detour is small. Batching is valid only when the orders are **geographically compatible and temporally compatible**.

Constraints for batching orders together:
- **Pickup proximity** — same restaurant, or restaurants within a short hop of each other (a food court, a dense market street).
- **Drop proximity** — deliveries in the same direction/cluster. A batch that goes north then south is worse than two separate trips.
- **Prep-time alignment** — the orders must be *ready* at compatible times. Batching a 10-min order with a 30-min order means one of them waits 20 minutes.
- **Freshness cap** — a hard limit on how long any order can sit. Never let batching optimization make one customer's food 25 minutes older to save a rider 5 minutes.

Formally this is a **Vehicle Routing Problem (VRP)** — a generalization of the Travelling Salesman Problem, and NP-hard. You do **not** solve it optimally.

**What you actually do:**
1. **Window the problem.** Collect dispatchable orders in a short **batching window** (~30–90s) per zone. Now you have tens of orders, not millions.
2. **Prune with the spatial index.** Only consider orders whose pickup and drop cells are near each other (geohash / quad-tree / H3 — same index as Problem 10 §4).
3. **Run a cheap heuristic**, not an exact solver — greedy insertion (take an existing route, insert the new order at the cheapest position, accept if added detour < threshold) or a clustering pass. Good-enough in milliseconds beats optimal in minutes.
4. **Cap batch size** (typically 2–4). The marginal gain falls off and the risk to the last customer in the batch rises fast.

> **Interview framing:** "This is a VRP, which is NP-hard, so I don't solve it exactly — I bound it with a short batching window and a spatial pre-filter so each decision is over tens of candidates, then run a greedy insertion heuristic with a hard cap on added detour and batch size. The window is the key lever: too short and there's nothing to batch, too long and every order is delayed waiting for a batch-mate."

### ③ Which rider — scoring, not just nearest

Query the geospatial index (Problem 10 §4) for available partners near the pickup, then score. Distance is only the first term:

| Signal | Why it matters |
|---|---|
| **ETA to restaurant** (road ETA, not straight-line) | The actual timing constraint from ① |
| **Current load** | A rider already carrying 2 orders may still be the best pick *if* the new order is on their route — this is what makes it batching rather than matching |
| **Route compatibility** | Added detour if this order is inserted into their existing route |
| **Acceptance probability** | Historical accept rate; offering to a likely-decliner wastes the whole assignment cycle |
| **Fairness / idle time** | Rotate work so earnings distribute reasonably — a pure-efficiency dispatcher starves some partners entirely |
| **Vehicle & capability** | Bike vs car, insulated bag for certain orders, long-distance eligibility |

**Then: offer, don't force.** Push the offer with a short accept window (~15–30s); on decline or timeout, fall to the next candidate. **Atomically claim** the rider's capacity slot before offering — two dispatch cycles in the same zone can otherwise pick the same rider (identical concurrency problem to Problem 10 §7).

---

<a name="eta"></a>
# 5. ETA — a sum of three predictions

The number the customer sees is:

```
  ETA  =  prep time            (restaurant — the hardest to predict)
        + rider → restaurant   (travel, road-aware)
        + wait at restaurant   (the gap between arrival and food-ready)
        + restaurant → customer (travel, road-aware, + batch detour)
        + handover buffer       (parking, building access, lift, finding the door)
```

**Why prep time is the hard one:**
- Restaurants **self-report optimistically**, especially when slammed — exactly when accuracy matters most.
- It depends on the restaurant's **current queue depth**, which the platform can observe (how many orders it has just routed there) even when the restaurant doesn't report it.
- It varies by **dish** (biryani ≠ a cold sandwich), by **basket size**, by **hour**, and by **day**.

So prep time is a **learned prediction**, not a lookup. Features: restaurant ID, dish mix, basket size, time of day, day of week, current outstanding orders at that restaurant, historical actuals vs promises for that restaurant, weather. This is what Swiggy's and DoorDash's published work is about — DoorDash reports moving to multi-task deep models with **probabilistic forecasts** (predicting a *distribution*, not a point estimate), and Swiggy to a multi-input multi-output model that learns shared structure across the legs rather than training each leg independently.

**Two system-design points that matter more than the model choice:**

1. **Predict a distribution, then quote a quantile — not the mean.** If you show the mean, you're late ~50% of the time by construction. Quoting something like the 70th–80th percentile trades a slightly longer promise for far fewer broken ones. This is a *product-correctness* decision expressed in the serving layer, and it's a strong thing to raise unprompted.
2. **Serve from a feature store with a strict latency budget.** ETA is on the checkout path, so the model must return in single-digit milliseconds. Precompute the slow-moving features (restaurant historical stats, corridor travel times) into a low-latency store; compute only the genuinely live ones (current queue depth, current traffic) at request time.

**Continuous revision:** the ETA is recomputed on every state transition (accepted, prep-ready, picked up, batch changed) and pushed over the WebSocket. Post-pickup the uncertainty collapses — the remaining ETA is just routing — which is why tracking feels accurate at the end and vague at the start.

---

<a name="search"></a>
# 6. Restaurant discovery & search *(Parts 25, 05)*

Reads outnumber orders ~50:1 (§2), so this path is where the traffic actually is.

**"Restaurants near me" = a geospatial query with filters.** Same index family as Problem 10 §4 — geohash/quad-tree on restaurant location — but with a crucial difference: **restaurants don't move.** That flips the workload from write-heavy to read-heavy, which means the whole listing is **aggressively cacheable**:

- **Cache per (geohash cell × sort order)**, not per user. Everyone in the same ~1km cell sees a near-identical list, so the cache hit rate is very high. TTL of a minute or two.
- **`isOpen` and `isAcceptingOrders` change constantly** and would destroy that cache if baked into the cached list. Keep the cached list **status-free** and overlay live status from a small, hot key-value lookup at render time.
- **Serviceability** is a real constraint, not a nicety: a restaurant is only listed if a rider can plausibly reach the customer. That's distance, current fleet availability in the zone, and rain/surge conditions — so the *same* geographic query can legitimately return different results at different times.

**Dish-level search** ("biryani near me") is an **inverted index** (Part 25) with a geo filter applied — the classic "text relevance ∩ geo bounding" query. In practice: search engine (Elasticsearch/OpenSearch) holding restaurants and dishes, with the geo filter applied *first* to shrink the candidate set, then relevance ranking, then business ranking (rating, delivery time, sponsored placement).

**Ranking** is a business surface, not just relevance: predicted ETA, rating, popularity, personalization, and paid placement all fold in. Worth naming — interviewers like seeing that you know listing order is a monetized product decision, not a pure sort.

---

<a name="order"></a>
# 7. Order lifecycle — the saga *(Part 14)*

```
CREATED → PAYMENT_AUTHORIZED → RESTAURANT_ACCEPTED → PREPARING
        → RIDER_ASSIGNED → PICKED_UP → DELIVERED
                                     ↘ CANCELLED / REFUNDED
```

This is a **saga** (same machinery as [Problem 16 §5](problem-16-payment-system-upi.md#saga)) because it spans independent services and independent *real-world actors*, each of which can fail:

| Failure | Compensation |
|---|---|
| Restaurant rejects after payment authorized | Void/refund the payment, notify, suggest alternatives |
| No rider found within threshold | Widen the search radius, then surge incentive, then cancel + full refund |
| Rider cancels mid-batch | **Re-dispatch just that order** — the other orders in the batch must not be disrupted |
| Customer cancels after prep started | Partial refund per policy; restaurant is still compensated |

**Design points:**
- **State transitions must be idempotent and event-sourced.** The rider's app is on a flaky mobile network and will resend "picked up" three times. Store transitions as an append-only event log and derive current state — this also gives you the customer-facing timeline for free.
- **Payment is authorized at order time, captured at delivery** — same reserve-then-consume pattern as inventory in [Problem 18](problem-18-ecommerce-amazon.md). Never capture money for food that a restaurant hasn't accepted yet.
- **Every state change fans out over a queue** (Part 13) to notifications, analytics, the ETA recompute, and the restaurant/rider apps — decoupled, so a slow notification provider can never stall an order transition.

---

<a name="db"></a>
# 8. Database *(Part 8)*

| Data | Pattern | Store |
|---|---|---|
| **Rider live location** | ~60K writes/s, latest-value-only, ephemeral | **In-memory geospatial index** (Redis Geo), sharded by city — *identical to Problem 10* |
| **Restaurant catalog + menus** | Read-heavy (~12K/s peak), rarely written | SQL or document store + **aggressive cache-aside** (Part 5) + CDN for images |
| **Restaurant live status** (`isOpen`, accepting, current queue depth) | Small, hot, changes constantly | Redis — deliberately **separate** from the cached catalog so it doesn't invalidate it |
| **Orders + state transitions** | Modest volume, must be durable & consistent, append-only event log | **SQL**, sharded by city/region; strong consistency on the order row |
| **Search index** (restaurants, dishes) | Read-heavy, geo + text | Elasticsearch/OpenSearch (Part 25) |
| **Dispatch working set** (orders awaiting batching) | Very hot, short-lived, per-zone | In-memory per-zone dispatch service |
| **ETA model features** | Read on every checkout, ms budget | Feature store (Redis/precomputed) |
| **Analytics / model training** | Bulk | Async fan-out (Part 13) → warehouse |

> The pattern repeats from Uber: **the hottest data (locations) is the least durable, the most durable data (orders) is comparatively low-volume.** The addition here is the *third* tier — the catalog/browse path, which is neither, and is pure read-scaling.

---

<a name="scaling"></a>
# 9. Scaling *(Parts 21, 24)*

**Shard by city.** Same argument as Uber, slightly stronger: a rider in Pune is never a candidate for an order in Chennai, **and** a restaurant in Pune is never listed in Chennai. Both the write path *and* the read path partition cleanly on geography — near-zero cross-shard queries.

```
[City: Bangalore]     [City: Delhi]      [City: Mumbai]
 own geo index         own geo index      own geo index
 own dispatch svc      own dispatch svc   own dispatch svc
 own order shard       own order shard    own order shard
 own catalog cache     own catalog cache  own catalog cache
```

**Within a city, shard the dispatch service by zone.** Batching only makes sense among geographically close orders, so a dispatcher only ever needs its own zone plus a peek at the boundary — the dispatch working set stays small enough to hold in memory and iterate over quickly. **Zone boundaries must overlap slightly**, or you systematically fail to batch two orders that sit on either side of a line.

**Handling the meal-time peak (the defining scaling problem here):**
- **Peak/average is 4–5×**, and it's *perfectly predictable* — same hours, every day. So use **scheduled/predictive autoscaling**, not purely reactive: scale up *before* 12pm, not in response to the 12:05 latency spike. Reactive autoscaling always lags the ramp.
- **Shed load in priority order.** Under extreme pressure, degrade *browse* (serve slightly staler cached lists, drop personalization, reduce page size) to protect *ordering and dispatch*. Never the reverse — a customer seeing a 2-minute-old restaurant list is fine; a customer whose paid order fails to dispatch is not.
- **Queue the spike, don't drop it** (Part 13). Order placement writes to a durable queue; dispatch consumes at its own rate. The batching window (§4) already tolerates a short delay, which means a modest backlog is genuinely harmless here — an unusual and useful property.
- **Supply-side levers are part of the system**, not just infrastructure: surge incentives to pull more riders online, and dynamically increasing quoted ETAs to shape demand when the fleet is saturated. Worth naming — capacity in this system is *people*, and you can only scale it with pricing, not with servers.

---

<a name="arch"></a>
# 10. Full architecture

```
 [Customer App]              [Restaurant Tablet]            [Rider App]
      │                             │                            │
      ▼                             ▼                            ▼
        [ API Gateway / LB — WebSocket-aware, sticky ]      (Parts 15, 26)
      │                             │                            │
      ▼                             ▼                            ▼
[Discovery/Search Svc]     [Restaurant Svc]          [Connection Servers ×N]
  │        │                  │  live status                 │  (loc ping ~5s)
  │        ▼                  ▼                              ▼
  │   [Search Index]     [Redis: isOpen,          [In-memory GEOSPATIAL INDEX]
  │    (Part 25)          queue depth]             Redis Geo, sharded by city
  ▼                            │                              │
[Catalog cache                 │                              │
 per geohash cell] ◀───────────┘                              │
      │                                                       │
      ▼                                                       │
 [ Order Service ]  ──event log──▶ [Order DB — SQL, sharded by city]
      │                                                       │
      │ (queue, Part 13)                                      │
      ▼                                                       │
 [ DISPATCH SERVICE — per zone, in-memory ]  ◀────────────────┘
      │  ① delay until (prep_ready − travel_time)
      │  ② batch: window ~30–90s → spatial prefilter → greedy insertion
      │  ③ score riders → atomic claim → offer (15–30s accept window)
      │
      ├──▶ [ ETA Service ] ──▶ [Feature store] + [routing engine]
      │
      └──▶ [ Payment Svc ]  (auth at order, capture at delivery — Problem 16)
      │
      ▼
 [ Queue → Notifications · Analytics · Model training ]   (Parts 13, 14)
```

**Read path (browse):** app → discovery → per-cell cached list (high hit rate) + live status overlay → ranked by ETA/rating/sponsorship.
**Write path (order):** order placed → saga: payment auth → restaurant accept (declares prep time) → **held in dispatch queue** → batched + assigned to arrive at prep-ready → picked up → delivered → payment captured.
**High-volume path (location):** rider ping → connection server → blind overwrite into the city's in-memory geo index → throttled fan-out to the customer's socket at ~10s.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How is this different from designing Uber?"
> *"Four ways, and they all change the design. First, it's a three-sided marketplace — the restaurant is an independent actor with its own capacity and its own accept/reject, which injects a prediction into the middle of the flow. Second, assignment is one-to-many, not one-to-one: a rider carries two to four orders, so this is a batching and routing optimization, not a matching problem. Third, and most counter-intuitively, I deliberately *delay* assignment — assigning instantly means the rider idles fifteen minutes at the counter, so I hold the order and assign so the rider arrives just as the food is ready. Fourth, the ETA is a sum of three predictions rather than one leg. The geospatial index from Uber I reuse essentially unchanged — that part isn't the interesting difference."*

### Q: "Walk me through how you decide which rider gets an order."
> *"Three decisions in order, and the order matters. First when: I compute the assignment time from predicted prep completion minus predicted travel-to-restaurant, so the rider arrives as the food is ready — biased slightly early, because a rider arriving two minutes early costs two minutes of one rider's time, while arriving five minutes late means cold food and every order behind it in the batch slips. Second what to batch: I collect dispatchable orders in a short window per zone, prefilter by spatial proximity of both pickup and drop, and require prep times to be compatible. Third who: I query the geo index for nearby available partners and score them on road ETA, current load, added detour if I insert this into their existing route, historical acceptance rate, and fairness — then I atomically claim their capacity slot and push an offer with a short accept window, falling through to the next candidate on decline."*

### Q: "Batching is a routing problem. How do you actually compute it at scale?"
> *"It's a Vehicle Routing Problem, which is NP-hard, so I don't solve it optimally — I bound it so the heuristic is good enough. Two bounds: a batching window of roughly thirty to ninety seconds, which collects a handful of candidate orders instead of an unbounded stream, and a spatial prefilter using the same geohash cells as the driver index, so only orders with nearby pickups and drops are even considered together. That leaves tens of orders per decision, and I run greedy insertion — take an existing route, insert the new order at its cheapest position, accept only if the added detour is under a threshold — with a hard cap on batch size, usually two to four. The window is the key tuning lever: too short and there's nothing to batch with, too long and every order pays a delay waiting for a batch-mate that may not arrive."*

### Q: "Why not just assign a rider the moment the order is placed?"
> *"Because the rider would arrive in six minutes for food that's ready in eighteen, and idle at the counter for twelve. Across the fleet that idle time is the single largest waste of delivery capacity, and delivery capacity is the dominant cost in this business. So the dispatch queue deliberately holds the order and assigns at a computed time. A useful side effect is that the system is genuinely tolerant of a short processing backlog — the batching window already builds in delay — which is why I can absorb the lunch spike by queueing rather than by shedding orders."*

### Q: "How do you predict the ETA, and what breaks?"
> *"The ETA is prep time plus rider-to-restaurant travel plus any wait at the restaurant plus restaurant-to-customer travel including batch detour, plus a handover buffer for parking and finding the door. The travel legs come from a routing engine; the hard one is prep time. Restaurants self-report it and they systematically under-report exactly when they're busiest, so I treat their number as a feature, not the answer, and learn the prediction — features being the restaurant, the dish mix and basket size, time of day and day of week, and critically the restaurant's current queue depth, which I know because I routed those orders there. Two things I'd call out beyond the model: I predict a distribution and quote a high quantile rather than the mean, because quoting the mean means being late half the time by construction; and it's on the checkout path with a millisecond budget, so slow-moving features are precomputed into a feature store and only genuinely live signals are computed at request time."*

### Q: "Lunch peak is five times average traffic. How do you handle it?"
> *"The important property is that it's completely predictable — same hours every day — so I use scheduled autoscaling rather than purely reactive, scaling up before noon instead of in response to the latency spike at 12:05, because reactive scaling always lags the ramp. Then I shed load in priority order: under real pressure I degrade browse first — staler cached lists, drop personalization, smaller pages — to protect ordering and dispatch, never the other way round. Order placement goes onto a durable queue so a burst becomes a backlog rather than errors, which the batching window absorbs anyway. And the last lever isn't infrastructure at all: capacity here is people, so surge incentives to bring riders online and stretching quoted ETAs to shape demand are part of the system's response to saturation."*

### Q: "A rider cancels while carrying a batch of three orders. What happens?"
> *"Only the affected assignment unwinds — the other two orders must not be disrupted, which is why each order in a batch keeps its own independent state machine and the batch is a property of the route, not of the order. The cancelled order goes back into the dispatch queue, and because prep is already done or nearly done its assignment timing constraint changes: it's now urgent rather than scheduled, so it jumps the normal delay and gets dispatched immediately, with a widened radius. If nothing is found within a threshold I escalate — surge incentive, then cancel with a full refund. All of it runs through the order saga's compensation path, and every transition is idempotent because the rider app is on a flaky mobile network and will resend the same event several times."*

### Q: "Reads are fifty times your orders. How do you serve the browse path?"
> *"Restaurants don't move, which flips the geospatial workload from write-heavy to read-heavy and makes the whole listing cacheable. I cache per geohash cell and sort order rather than per user — everyone in the same cell sees essentially the same list, so hit rates are very high with a one-to-two-minute TTL. The trap is that isOpen and accepting-orders change constantly and would invalidate that cache continuously, so I deliberately keep the cached list status-free and overlay live status from a small hot key-value lookup at render time. Dish search is an inverted index with the geo filter applied first to shrink the candidate set, then relevance, then business ranking — which does include sponsored placement, since listing order is a monetized product surface, not a pure sort."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

- **Shape:** three-sided marketplace (customer ↔ restaurant ↔ rider). **Batching + scheduling problem, not a matching problem.** Reuses Uber's geo index; everything else differs.
- **Estimate:** ~5M orders/day → ~58/s avg but **~240/s at meal peak (4–5× spike)**; ~60K rider location writes/s; **~50 browse reads per order** → reads dominate.
- **Core ① — delayed dispatch:** assign at `prep_ready − travel_to_restaurant`, **biased early**. Instant assignment = rider idles at the counter = the biggest waste of fleet capacity.
- **Core ② — batching:** VRP, NP-hard → don't solve exactly. Bound with a **30–90s batching window** + **spatial prefilter**, then **greedy insertion** with a detour threshold and **batch cap 2–4**. Constraints: pickup proximity, drop proximity, prep-time alignment, hard freshness cap.
- **Core ③ — rider scoring:** road ETA + current load + added detour + acceptance probability + fairness + vehicle type. **Offer with timeout, atomic claim** before offering (same race as Uber).
- **ETA = prep + travel-to-restaurant + wait + travel-to-customer + handover.** Prep time is learned, not reported (restaurants under-report when busy); key features include **current queue depth at that restaurant**. **Quote a high quantile, not the mean.** Serve from a feature store on a ms budget. Revise continuously over WS.
- **Discovery:** restaurants don't move → read-heavy → **cache per geohash cell**, keep **live status out of the cached list** and overlay it. Dish search = inverted index (Part 25) with geo filter first. Ranking includes sponsorship.
- **Order = saga** (Part 14) — payment **authorized at order, captured at delivery**; event-sourced, idempotent transitions (flaky mobile network); compensation per failure mode.
- **DB:** locations → in-memory geo (Redis Geo); catalog → cache-aside + CDN; live status → separate Redis; orders → SQL sharded by city, append-only event log; search → Elasticsearch.
- **Scale:** shard by **city** (both read and write paths partition cleanly), dispatch by **zone within city** with **overlapping boundaries**. Peak is predictable → **scheduled autoscaling**. Shed **browse** before **ordering**. Capacity is people → surge + ETA-stretching are real scaling levers.
- **Cross-refs:** Problem 10 (geo index, atomic claim, WebSocket layer — reused directly), Problem 16 (saga + idempotency spine), Part 25 (search), Part 13/14 (queues, event-driven), Part 26 (realtime tracking).

*— Design Problem 17 complete —*
