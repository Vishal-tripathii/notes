# Design Problem 18 — E-commerce (Amazon / Flipkart)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 05, 08, 13, 14, 21, 25.
>
> **Signature challenge:** **inventory reservation without overselling** — a three-state stock model with an atomic conditional write, a reservation that expires, and a checkout saga that spans cart, inventory, payment, and fulfilment. Then: surviving a flash sale, where all of that contends on a single hot row.
>
> **Contrast with [`problem-14-ticket-booking-bookmyshow.md`](problem-14-ticket-booking-bookmyshow.md):** both are "don't sell the same thing twice," but the inventory is a fundamentally different shape — see §1. Reading them together is the point.

---

## Table of Contents

1. [Requirements — fungible vs identified inventory](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: inventory reservation](#core)
5. [Checkout as a saga](#saga)
6. [Flash sale — when the core breaks](#flashsale)
7. [Catalog, search & cart](#catalog)
8. [Database](#db)
9. [Scaling](#scaling)
10. [Full architecture](#arch)
11. [Interview Q&A](#interview)
12. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements — fungible vs identified inventory *(Part 1)*

**Functional:**
1. Browse and **search** a catalog of hundreds of millions of products.
2. Add to **cart**; cart persists across devices and sessions.
3. **Checkout** — reserve stock, take payment, create an order.
4. Order tracking, cancellation, returns/refunds.
5. Multiple sellers and multiple warehouses per product.

**Non-functional:**
- **Never oversell** — selling stock you don't have means cancelling a paid order, which is the single worst customer outcome in the product.
- **Browse must never go down.** Availability on the read path beats consistency (**AP**); a slightly stale price or stock count on a listing page is acceptable.
- **Checkout must be correct.** Consistency on the write path beats availability (**CP**). *Different halves of the same product make opposite CAP choices (Part 4)* — that's the design's defining tension.
- **Extreme read:write skew** and **extreme spikes** (Big Billion Days / Prime Day / flash drops).

### The inventory-shape distinction

Both this and BookMyShow forbid double-selling, but what you're protecting is different, and it changes the mechanism:

| | **BookMyShow (Problem 14)** | **E-commerce (this)** |
|---|---|---|
| **Inventory unit** | **Identified** — seat `A12` for show `S`. The customer wants *that specific one*. | **Fungible** — any 1 of 500 units of SKU `X`. Units are interchangeable. |
| **Data model** | A **row per seat**, each with a state | A **counter per (SKU, warehouse)** |
| **Concurrency primitive** | Lock/claim the **specific row** | **Atomic conditional decrement** of a counter |
| **Contention shape** | Spread across many seat rows; hot only for one popular show | Concentrated on **one row per SKU** — brutally hot in a flash sale |
| **Hard part** | Holding a seat while the user pays, and releasing it if they don't | Same hold problem, *plus* the single-hot-row throughput ceiling |

> **Worth saying explicitly:** "Because units are fungible, I don't need per-item locking — I need an atomic counter with a conditional check. That's cheaper, but it concentrates all contention on one row, which is exactly why flash sales are the hard case here and weren't in the ticketing problem."

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume a large marketplace: **~10M orders/day**, ~300M catalog items.

- **Orders/sec:** 10M ÷ 86,400 ≈ **~115/s** average.
- **Browse/search traffic:** typical funnel is **~100 product views per order** → ~11,500 views/sec average. With search and listing pages, call it **~20K reads/sec average**.
- **Read : write ratio ≈ 100:1** — and that's the *steady-state* ratio.
- **Sale-event peak:** **10–50× normal** on a headline sale. ~115/s → **~3,000–5,000 orders/sec**, and reads spike harder because everyone refreshes. This is the number the architecture must survive, not the average.
- **Flash-drop peak (the real extreme):** 100K users hitting **one SKU** in the first 2 seconds → **~50,000 requests/sec against a single inventory row.** No single row in any database serves that. §6 is entirely about this number.
- **Storage:** catalog 300M items × ~5KB ≈ **~1.5TB** (small, and highly cacheable); orders 10M/day × ~2KB ≈ **~20GB/day**; product images/video dominate raw bytes → object storage + CDN (Part 2.7).

> Two numbers to design against: **100:1 read:write** (so the read path is a caching problem) and **50K/s on one row** (so the write path's worst case is a single-key contention problem, not a throughput problem).

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
GET  /api/v1/products/{sku}
→ 200 { "sku", "title", "price", "images", "availability": "IN_STOCK" | "LOW" | "OUT" }

GET  /api/v1/search?q=laptop&filters=&cursor=
→ 200 { "items": [...], "facets": {...}, "nextCursor" }

POST /api/v1/cart/items      Body: { "sku", "qty" }
→ 200 { "cart": {...} }        ← cart add does NOT reserve stock

POST /api/v1/checkout
Headers: Idempotency-Key: <UUID>
Body: { "cartId", "addressId", "paymentMethod" }
→ 201 { "orderId", "status": "PENDING_PAYMENT",
        "reservationExpiresAt": "2026-08-24T10:15:00Z" }   ← the hold, made explicit

POST /api/v1/orders/{orderId}/confirm      (after payment callback)
→ 200 { "orderId", "status": "CONFIRMED" }

GET  /api/v1/orders/{orderId}
→ 200 { "status", "items", "shipments": [...], "timeline": [...] }
```

**Three decisions worth defending:**

1. **Adding to cart does not reserve stock.** Carts are abandoned constantly — reserving on add would park real inventory behind users who never buy, and make the site show "out of stock" while warehouses are full. Reservation happens at **checkout**, not at cart-add. (Consequence: an item can disappear between cart and checkout. That's the correct trade, and the UI must handle it.)
2. **`availability` is a coarse label, not an exact count.** Returning `"IN_STOCK" | "LOW" | "OUT"` instead of `"units": 47` means the value survives caching for far longer — an exact count is invalidated by every single purchase, a coarse bucket almost never changes. This one choice is what makes the read path cacheable at all.
3. **`reservationExpiresAt` is in the response.** The hold is explicit and time-bounded in the contract, so the client can show a countdown and the server has a clean basis for reclaiming it.

---

<a name="core"></a>
# 4. Core: inventory reservation 🎯

### 4a. Three numbers, not one

Do **not** model stock as a single `quantity` column. Model it as **three** per `(sku, warehouse)`:

```
inventory
┌──────┬───────────┬──────────┬──────────┬───────────┐
│ sku  │ warehouse │ on_hand  │ reserved │ available │
├──────┼───────────┼──────────┼──────────┼───────────┤
│ X    │ BLR-1     │   500    │    12    │    488    │
└──────┴───────────┴──────────┴──────────┴───────────┘

     available = on_hand − reserved     (invariant, always)
```

- **`on_hand`** — units physically in the warehouse. Changes on receipt and on shipment.
- **`reserved`** — units promised to in-flight checkouts but not yet shipped.
- **`available`** — what can still be sold.

Why three: with one number you can't distinguish "sold and shipped" from "held for someone mid-checkout," so you either oversell (don't count holds) or under-sell permanently (never release holds). The three-number model makes both states representable and the invariant checkable.

### 4b. The atomic conditional write

Reservation is **one statement**, and the database's row-level atomicity does all the work:

```sql
UPDATE inventory
   SET reserved  = reserved  + :qty,
       available = available - :qty
 WHERE sku = :sku
   AND warehouse = :wh
   AND available >= :qty;          -- ← the guard. This is the whole mechanism.
```

Then check **rows affected**: `1` → reserved successfully. `0` → insufficient stock, reject.

Three properties that make this the right answer:

- **Oversell becomes structurally impossible.** The `available >= :qty` guard is evaluated *inside* the same atomic row operation that performs the decrement. Two concurrent requests for the last unit are serialized by the row lock; the second sees `available = 0`, matches zero rows, and is rejected. There is no window between check and decrement — which is exactly the bug in "read stock, then write stock."
- **No application-level locking.** No `SELECT ... FOR UPDATE` round trip, no distributed lock, no Redis lock with all its expiry-vs-work-duration failure modes. One statement, one round trip.
- **It's the same trick as an atomic counter** — CAS semantics expressed in SQL. Say that; it shows you know *why* it works, not just that it does.

> **The failure mode to name:** the classic bug is `SELECT quantity` → check in application code → `UPDATE quantity = quantity - 1`. Between the read and the write, another request does the same thing, and both succeed. This is a **read-modify-write race**, and the fix is always to push the condition *into* the write.

### 4c. Reservations must expire

A reservation held forever by an abandoned checkout is stock permanently destroyed. So every reservation carries an expiry:

```
reservations
┌───────────┬──────┬─────┬─────────┬────────────────────┐
│ order_id  │ sku  │ qty │ status  │ expires_at         │
├───────────┼──────┼─────┼─────────┼────────────────────┤
│ ord_991   │ X    │  1  │ HELD    │ 2026-08-24 10:15Z  │
└───────────┴──────┴─────┴─────────┴────────────────────┘
```

**Lifecycle:**

```
  checkout starts   →  RESERVE   (available↓, reserved↑, expires_at = now + ~10 min)
  payment succeeds  →  CONSUME   (reserved↓, on_hand↓)      ← stock truly leaves
  payment fails     →  RELEASE   (reserved↓, available↑)
  timer expires     →  RELEASE   (same, driven by a sweeper)
```

**Reclaiming expired holds — two mechanisms, and you want both:**
1. **A sweeper job** runs continuously, finds `HELD` reservations past `expires_at`, and releases them. Simple, but it's a background job — it can lag, or die.
2. **Lazy release on contention.** When a reservation attempt fails for insufficient stock, opportunistically release any expired holds on that SKU and retry once. This makes reclamation *self-healing under exactly the load where it matters* — nobody cares about a stale hold on a slow-moving item, but on a contended item the next buyer triggers cleanup themselves.

**The reservation window is a product decision, not a technical one.** Ten minutes is generous for a card payment and far too long for a flash sale (§6), where it's often cut to 1–2 minutes precisely because holds are the scarce resource.

---

<a name="saga"></a>
# 5. Checkout as a saga *(Part 14)*

Checkout spans several services, each with its own database. There is no distributed transaction — same reasoning as [Problem 16 §5](problem-16-payment-system-upi.md#saga): 2PC across services means participants blocking on locks while a coordinator may die, and at checkout volume that's unworkable.

```
 ①  Validate cart & price     →  compensate: (nothing — no side effect)
 ②  RESERVE inventory         →  compensate: RELEASE
 ③  Authorize payment         →  compensate: VOID / REFUND
 ④  Create order              →  compensate: CANCEL order
 ⑤  CONSUME inventory         →  compensate: restock + refund
 ⑥  Emit → fulfilment/shipping
```

**Design points:**

- **Reserve before charging, always.** Taking money for stock you haven't secured means refunding a customer who thought they'd bought something — far worse than "sorry, it just went out of stock" *before* payment.
- **Authorize at checkout, capture at ship.** Same reserve-then-consume shape as inventory, applied to money. An authorization is a hold you can void cheaply; a capture is real and refunding it is expensive and slow.
- **Every step is idempotent, driven by an idempotency key** threaded from the checkout request through every downstream call. Payment gateway timeouts *will* happen, and the retry must not double-authorize (Problem 16 §4a).
- **Orchestrated, not choreographed.** Checkout needs a single inspectable state machine — when support asks "where is order 991," you want one service that can answer.
- **Compensation is not rollback.** Steps already committed stay committed; you *append* a corrective action. A voided authorization may still briefly appear on the customer's statement — that's correct and expected.

**Prices are captured into the order at checkout**, not re-read at each step — otherwise a mid-saga price change produces an order whose total doesn't match what the customer agreed to.

---

<a name="flashsale"></a>
# 6. Flash sale — when the core breaks 🔥

§4's conditional `UPDATE` is correct and handles normal traffic comfortably. It **falls over** at 50,000 requests/sec against one row, because every request serializes on that row's lock. Queue depth explodes, checkout latency crosses the client timeout, clients retry, and the retries make it worse — a textbook **congestive collapse**, and (as the payment literature notes) the retries can produce duplicate payment authorizations too.

Four techniques, layered. **They are defence in depth — each one shrinks what reaches the next.**

### ① Reject early at the edge — admission control
Only ~10,000 units exist; 500,000 people are trying. **~98% of that traffic is doomed** and there is no reason to let it reach the database.

- Maintain an **approximate remaining count in a cache** (Redis). Once it hits zero, the **edge** serves "sold out" — no database contact at all.
- **Rate-limit per user/device** (Part 23) at the gateway to blunt bots and retry storms.
- Approximate is fine here: rejecting someone a moment early during a sellout is acceptable; **overselling is not**. Failing in the safe direction is the whole point.

### ② Virtual queue / waiting room
Rather than 500K concurrent attempts, admit users into the checkout flow at a **controlled rate** — a token or queue position, with a visible position indicator. This converts an uncontrolled thundering herd into a **paced stream the inventory row can actually serve**, and it's a far better user experience than a page that times out.

### ③ Decrement in Redis, persist asynchronously
Move the hot counter off the relational row entirely:

- Redis `DECR` on a key holding remaining units. It's **single-threaded and atomic**, so the "never below zero" guarantee still holds (use a small Lua script to make check-and-decrement one atomic operation).
- Redis handles this at orders of magnitude more throughput than a disk-backed row.
- **Reconcile to the durable store asynchronously**, and treat the SQL row as the eventual source of truth. Redis is the *admission gate*; the database is the *record*.
- **Name the risk yourself:** if Redis loses the counter (failover, eviction), you can oversell. Mitigate with persistence/replication on that key, plus a durable log of every successful decrement so the truth is reconstructible — and reconcile against `on_hand` before actually shipping.

### ④ Shard the counter
Split one SKU's 10,000 units into **N independent sub-counters** (say 10 × 1,000), each on its own key/row. Route each request to a random shard. Contention drops ~N-fold.

- **Cost:** a request can hit an empty shard while others still have stock, causing a false "sold out."
- **Mitigation:** on empty, retry against a different shard a couple of times, and rebalance shards as they drain unevenly.
- This is the same idea as **sharded counters** in high-write systems generally — trade exactness of the "is it really zero" boundary for throughput.

**Then, behind all four:** the durable conditional `UPDATE` from §4 remains as the final authority. The layers reduce *volume*; they don't replace the guarantee.

> **How to present this:** "My baseline is an atomic conditional update, which is correct and handles ordinary load. A flash sale breaks it — not because it's wrong but because 50,000 requests a second serialize on one row. So I layer defences that each shrink the traffic reaching it: reject the doomed 98% at the edge from an approximate cached count, pace the rest through a virtual queue, do the hot decrement in Redis where it's atomic and fast, and shard the counter if that's still not enough. The durable conditional update stays underneath as the final authority — I'm reducing volume, not weakening the guarantee. And I'd rather fail safe by rejecting slightly early than ever oversell."

---

<a name="catalog"></a>
# 7. Catalog, search & cart *(Parts 05, 25)*

**Catalog (100:1 reads):** the classic read-scaling problem.
- **Aggressive cache-aside** (Part 5) on product detail; product data changes rarely.
- **CDN** (Part 2.7) for images/video, which dominate bytes.
- The **only volatile field is stock** — which is exactly why §3 returns a coarse `IN_STOCK`/`LOW`/`OUT` bucket rather than an exact count. Keeping the volatile field out of the cacheable payload is the same technique as keeping restaurant open/closed status out of the cached listing in [Problem 17 §6](problem-17-food-delivery-swiggy-zomato.md#search).
- **Denormalize for the read path.** A product page assembles title, images, price, seller, ratings, and offers — precompute that into one document rather than joining across services per request.

**Search (Part 25):** inverted index (Elasticsearch/OpenSearch) over titles, descriptions and attributes, with **faceted filtering** (brand, price range, rating) — facets are aggregations over the result set, which is precisely what the search engine is good at and the relational database is not. Ranking blends text relevance, popularity, conversion rate, personalization, and sponsored placement. The index is fed **asynchronously** from catalog changes via a queue (Part 13) — search being seconds stale is fine; blocking a catalog write on an index update is not.

**Cart:** small, hot, per-user, must survive session and device changes.
- Key-value store (Redis with persistence, or DynamoDB), keyed by user.
- **Not** in the relational order database — different lifecycle, different consistency needs, vastly higher write rate.
- **Prices are re-validated at checkout**, never trusted from the cart. A cart can sit for weeks; the price and availability in it are display hints, not a contract.

---

<a name="db"></a>
# 8. Database *(Part 8)*

| Data | Pattern | Store |
|---|---|---|
| **Inventory** | Atomic conditional writes, strict correctness, hot rows | **SQL** — row-level atomicity is the mechanism; sharded by SKU |
| **Orders + saga state** | Durable, transactional, moderate volume | **SQL**, sharded by `customer_id` (or `order_id`) |
| **Catalog** | 300M items, read-heavy, flexible per-category attributes | Document store (varying schema per category) + heavy cache |
| **Search index** | Text + facets | Elasticsearch/OpenSearch (Part 25) |
| **Cart** | Hot, per-user, high write rate, low durability need | Redis (persistent) / DynamoDB |
| **Flash-sale counter** | Extreme contention on one key | Redis with atomic DECR + async persistence (§6) |
| **Recommendations / analytics** | Bulk, offline | Async fan-out (Part 13) → warehouse |

> The recurring shape across this whole track: **SQL where correctness is the requirement** (inventory, orders), **NoSQL + cache where scale and flexibility are** (catalog, cart), **a search engine where neither relational nor KV fits** (facets and relevance). Choosing one database for all of it is the wrong answer.

---

<a name="scaling"></a>
# 9. Scaling *(Parts 21, 24)*

**Shard inventory by SKU.** Different products are independent, so the shard key is natural and cross-shard queries are rare.
- **Multi-item orders do span shards.** That's fine — the saga (§5) handles it: reserve each item independently, and if any reservation fails, release the ones that succeeded. This is exactly why reservation is a compensatable step rather than part of one big transaction.
- **Hot SKUs still concentrate on one shard.** Sharding by SKU spreads *different* products; it does nothing for one viral product. That's §6's problem, and it's worth saying that sharding does not solve it.

**Shard orders by `customer_id`** — "my orders" is the dominant query and it stays single-shard.

**Read scaling:** read replicas + multi-layer caching (CDN → edge → application cache → DB). Browse traffic should very rarely reach the database at all.

**Handling sale events (10–50×):**
- **Pre-scale.** Big Billion Days is on the calendar; scale ahead of it rather than reacting. Same argument as the predictable meal peak in [Problem 17 §9](problem-17-food-delivery-swiggy-zomato.md#scaling), with far more warning.
- **Pre-warm caches** with the sale's catalog before it opens — a cold cache at t=0 sends the full spike straight to the origin.
- **Degrade in priority order:** drop recommendations, reviews, and personalization first; protect **checkout** last. A product page missing its "customers also bought" strip still converts; a checkout that 500s does not.
- **Bulkhead the services** (Part 22). A recommendation service collapsing under load must not take checkout with it — separate pools, separate limits, circuit breakers.
- **Async everything non-essential.** Invoicing, emails, loyalty points, analytics, warehouse notification — all fire off the order event via a queue (Part 13), never inline in the checkout path.

---

<a name="arch"></a>
# 10. Full architecture

```
                        [ Web / Mobile ]
                              │
                    [ CDN — images, static ]        (Part 2.7)
                              │
                    [ API Gateway — authN, rate limit ]   (Parts 15, 23)
                              │
        ┌──────────────┬──────┴───────┬──────────────┬─────────────┐
        ▼              ▼              ▼              ▼             ▼
  [Catalog Svc]   [Search Svc]   [Cart Svc]   [Checkout Orchestrator]  [Order Svc]
        │              │              │              │  (SAGA)          │
        ▼              ▼              ▼              │                  ▼
  [Doc store   ]  [Elasticsearch] [Redis /      ┌────┴─────┬──────────┐ [Order DB
   + CACHE      ]  (Part 25)       DynamoDB]    ▼          ▼          ▼  SQL, sharded
        ▲              ▲                  [Inventory]  [Payment]  [Fulfilment]  by customer]
        │              │                       │           │
        └──async───────┘                       │           └─▶ (Problem 16)
         (Part 13: catalog → index)            │
                                               ▼
   ┌───────────────── FLASH-SALE PATH ─────────────────────────┐
   │  ① edge reject (approx count, sold-out)                    │
   │  ② virtual queue / waiting room (paced admission)          │
   │  ③ Redis atomic DECR (sharded counter)                     │
   │  ④ ───── async reconcile ─────▶ [Inventory DB — SQL]       │
   └────────────────────────────────────────────────────────────┘
                                               │
                                     UPDATE ... WHERE available >= qty
                                     (final authority, always)
                                               │
                                               ▼
                            [ Queue → invoicing · email · loyalty ·
                              warehouse · analytics ]   (Parts 13, 14)
```

**Read path:** CDN → cache → catalog/search. Coarse availability label keeps it cacheable. Rarely touches the DB.
**Write path:** checkout → saga → **reserve** (atomic conditional update, expiring hold) → **authorize** payment → create order → **consume** on ship. Any failure compensates backwards.
**Flash path:** four layers of admission control in front of the same conditional update.

---

<a name="interview"></a>
# 11. Interview Q&A

### Q: "How do you make sure you never oversell?"
> *"I model stock as three numbers per SKU and warehouse — on hand, reserved, and available, with available always equal to on-hand minus reserved — and reservation is a single conditional update: increment reserved and decrement available where available is at least the requested quantity. Then I check rows affected: one means I got it, zero means insufficient stock. The guard is evaluated inside the same atomic row operation as the decrement, so there's no window between checking and writing. Two concurrent requests for the last unit serialize on the row lock and the second one matches zero rows. The bug this avoids is the classic read-modify-write race — select the quantity, check it in application code, then update — where both requests read the same value and both succeed."*

### Q: "Why not reserve stock when the item is added to the cart?"
> *"Because carts are abandoned constantly, so I'd be parking real inventory behind users who never buy — the site would show out-of-stock while the warehouses are full. Reservation happens at checkout, when there's actual intent and a payment about to be attempted. The consequence is that an item can vanish between cart and checkout, which the UI has to handle gracefully, and I'd also re-validate price at checkout rather than trusting the cart, since a cart can sit for weeks."*

### Q: "A user reserves stock and then closes the browser. What happens to that stock?"
> *"Every reservation carries an expiry, typically around ten minutes, and it's returned in the checkout response so the client can show a countdown. Two mechanisms reclaim it. A sweeper job continuously releases holds past their expiry — simple, but it's a background job that can lag or die. So I also do lazy release on contention: when a reservation attempt fails for insufficient stock, I opportunistically release expired holds on that SKU and retry once. That makes reclamation self-healing exactly where it matters, since nobody cares about a stale hold on a slow-moving item, but on a contended item the next buyer triggers the cleanup themselves. The window length is a product decision — ten minutes suits a card payment, but in a flash sale I'd cut it to one or two, because there the holds are the scarce resource."*

### Q: "How is this different from the ticket booking problem?"
> *"The inventory shape differs, and that changes the mechanism. Ticketing inventory is identified — the customer wants seat A12 specifically — so it's a row per seat and you lock the specific row. E-commerce inventory is fungible — any one of five hundred units — so it's a counter with an atomic conditional decrement, which is cheaper because there's no per-item row to lock. But the trade is that all contention concentrates on one row per SKU, whereas seats spread across many rows. That's precisely why flash sales are the hard case here and weren't in ticketing: fungible inventory gives you a cheaper primitive and a much worse hot spot."*

### Q: "Flash sale: 100,000 people, 10,000 units, 2 seconds. Your conditional update dies. Now what?"
> *"It dies because fifty thousand requests a second all serialize on one row — queue depth explodes, checkout crosses the client timeout, clients retry, and the retries make it worse. So I layer four defences that each shrink what reaches the next. First, admission control at the edge: an approximate remaining count in Redis, and once it's zero the edge serves sold-out without touching the database — about ninety-eight percent of that traffic is doomed anyway, and rejecting slightly early is acceptable while overselling never is. Second, a virtual queue that admits users into checkout at a controlled rate, turning a thundering herd into a paced stream and giving a far better experience than a timing-out page. Third, do the hot decrement in Redis, which is single-threaded and atomic so the never-below-zero guarantee holds, with a Lua script to make check-and-decrement one operation, reconciling to SQL asynchronously. Fourth, if that's still not enough, shard the counter — ten sub-counters of a thousand each, routed randomly — accepting that a request can hit an empty shard and get a false sold-out, so I retry against another shard a couple of times. Underneath all of it the durable conditional update stays as the final authority: I'm reducing volume, not weakening the guarantee. The risk I'd name unprompted is that if Redis loses the counter on failover I can oversell, so I keep replication and a durable log of every decrement, and reconcile against on-hand before anything actually ships."*

### Q: "Walk me through checkout across services. Distributed transaction?"
> *"No — 2PC across services means participants holding locks while waiting on a coordinator that can die, and at checkout volume that's unworkable. It's a saga: validate the cart, reserve inventory, authorize payment, create the order, consume inventory on ship, then emit to fulfilment. Each step has a compensating action — release the reservation, void the authorization, cancel the order. Two ordering rules matter: reserve before charging, because taking money for stock I haven't secured means refunding someone who thought they'd bought something, which is much worse than an out-of-stock message before payment; and authorize at checkout but capture at ship, which is the same reserve-then-consume shape applied to money — an authorization is a cheap hold, a capture is real and expensive to reverse. Every step carries an idempotency key threaded from the original request, because gateway timeouts will happen and a retry must not double-authorize. And I'd orchestrate rather than choreograph, so there's one state machine that can answer 'where is this order.'"*

### Q: "Reads are a hundred times your writes. How do you serve them?"
> *"Multi-layer caching — CDN for images, which dominate bytes, then edge and application caches for product data, which changes rarely. The trick is that the only genuinely volatile field on a product page is stock, and an exact count is invalidated by every single purchase. So I return a coarse label — in stock, low, or out — rather than a number. That one choice is what makes the payload cacheable for minutes instead of milliseconds. I'd also denormalize the product page into a single precomputed document rather than joining across services per request. Search is a separate concern — an inverted index with faceted filtering, fed asynchronously from catalog changes over a queue, because search being a few seconds stale is fine but blocking a catalog write on reindexing is not."*

### Q: "Big Billion Days is fifty times normal traffic. How do you prepare?"
> *"The main thing is that it's on the calendar, so I pre-scale rather than react, and I pre-warm the caches with the sale catalog before it opens — a cold cache at t-zero sends the whole spike straight to the origin. Then I degrade in priority order: recommendations, reviews and personalization get dropped first, checkout is protected last, because a product page missing its 'customers also bought' strip still converts and a checkout returning 500 does not. Services are bulkheaded with separate pools and circuit breakers, so a recommendation service collapsing can't take checkout down with it. And everything non-essential comes off the critical path onto a queue — invoicing, emails, loyalty points, warehouse notification, analytics all fire from the order event rather than running inline in checkout."*

---

<a name="cheatsheet"></a>
# 12. Cheat Sheet

- **Shape:** two halves making **opposite CAP choices** — browse is AP (stale is fine, must never go down), checkout is CP (must be correct). Say this early.
- **Inventory is fungible** (any unit) vs BookMyShow's **identified** (seat A12) → counter + atomic decrement instead of per-row locking → cheaper, but **all contention lands on one row**.
- **Estimate:** ~10M orders/day → ~115/s avg, **100:1 read:write**, sale peak 10–50×, **flash drop ≈ 50K req/s on ONE row**.
- **Core — three numbers:** `on_hand`, `reserved`, `available`; invariant `available = on_hand − reserved`.
- **Core — one statement:** `UPDATE ... SET reserved+=q, available-=q WHERE available >= q` → check **rows affected**. Guard is *inside* the atomic write → no read-modify-write race, no application lock.
- **Reservations expire** (~10 min): RESERVE → CONSUME on payment / RELEASE on failure or timeout. Reclaim via **sweeper job + lazy release on contention** (self-healing where it matters).
- **Reserve before charging. Authorize at checkout, capture at ship.** Same reserve-then-consume shape for stock and money.
- **Checkout = orchestrated saga**, every step idempotent with a threaded idempotency key; compensations: release / void / cancel. Prices captured at checkout, not re-read.
- **Flash sale (4 layers, defence in depth):** ① edge reject on approximate cached count ② virtual queue for paced admission ③ Redis atomic DECR (Lua for check+decrement) with async persistence ④ sharded counter (accepts false sold-outs). **Durable conditional UPDATE stays the final authority.** Redis failover = oversell risk → replicate + durable decrement log + reconcile before shipping.
- **Cacheability trick:** return **coarse availability** (`IN_STOCK`/`LOW`/`OUT`), not an exact count — keeps the volatile field out of the cached payload. (Same move as live restaurant status in Problem 17.)
- **DB:** inventory + orders → SQL (correctness); catalog → document store + heavy cache; cart → Redis/DynamoDB (never the order DB); search → Elasticsearch with facets; flash counter → Redis.
- **Scale:** shard inventory by **SKU** (multi-item orders span shards → saga handles it; hot SKU is *not* solved by sharding), orders by **customer_id**. Sale events: **pre-scale + pre-warm caches**, degrade recommendations before checkout, bulkhead services, async everything non-essential.
- **Cross-refs:** Problem 14 (identified-inventory contrast), Problem 16 (saga + idempotency + authorize/capture), Problem 17 (cache-the-stable-part-overlay-the-volatile-part trick), Part 23 (rate limiting the herd), Part 25 (search), Part 22 (bulkheads/circuit breakers).

*— Design Problem 18 complete —*
