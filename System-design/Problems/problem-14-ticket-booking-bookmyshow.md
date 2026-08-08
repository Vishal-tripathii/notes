# Design Problem 14 — Ticket Booking (BookMyShow HLD)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 04, 21. **Signature challenge:** inventory consistency under concurrent booking **AT SYSTEM SCALE** — no seat/ticket double-sold, across a fleet of app servers and a sharded/replicated database. Note: **[`../../LLD/Problems/problem-08-bookmyshow.md`](../../LLD/Problems/problem-08-bookmyshow.md)** covers the CLASS design (seat-lock manager, TTL holds) for **one service instance** — this file is how that same guarantee holds when there are **many app server instances and a distributed database** behind them.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: distributed inventory consistency](#core)
5. [CAP trade-off](#cap)
6. [Database](#db)
7. [Scaling — the virtual waiting room](#scaling)
8. [Full architecture](#arch)
9. [Interview Q&A](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Browse movies/shows by city, theater, date.
2. View a show's seat map (available / held / booked).
3. **Hold** selected seats during checkout (short TTL, ~5–10 min) while the user pays.
4. **Confirm booking** with payment — hold converts to a confirmed, paid ticket.
5. **Release** the hold automatically on timeout, or immediately on cancel.

Same functional shape as the LLD version — the difference is entirely in the *non-functional* column:

**Non-functional:**
- **No double-sold seats — ever**, even though there are now **many app server instances** behind a load balancer (any of them can handle any request) and a **sharded/replicated database** underneath (not one machine with one in-process lock).
- **High availability for browsing** (show listings, seat maps) — stale is fine.
- **Strong correctness for the booking write path** — wrong beats unavailable... no, wrong is *never* acceptable; **unavailable beats wrong**.
- **Bursty, spiky load** — a popular movie's booking window opening ("on-sale") creates a flash-sale-style spike, not steady traffic.

> The LLD file solved "two threads in one process racing on `Seat.status`." Here the race is "two *different machines*, each with their own memory, each convinced they got the lock." An in-process `synchronized` block or a JS closure over a `Map` does nothing across a network — that's the whole problem this file exists to solve.

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume a big-city release: 500 theaters live, 50 shows/theater/day, ~150 seats/show.

**Steady state:**
- Browsing traffic dominates: ~50,000 DAU checking listings → **~50 reads/s** average, bursty around showtimes.
- Bookings: ~200K tickets/day → 200,000 ÷ 86,400 ≈ **~2–3 bookings/s** average.

**The number that actually matters — the on-sale spike:**
- A blockbuster opens booking for a specific show at a fixed time (e.g. "tickets live at 10:00 AM").
- 100,000 users refreshing/clicking in the first 60 seconds, all fighting over ~150 seats in that show.
- **Peak attempted booking requests: ~1,500–2,000/s** for that single show, against **150 physical seats**.
- This is a **150:2,000 contention ratio** — 99%+ of requests during the spike *must* fail gracefully (seat gone), not error out or corrupt data.

> This is why the design isn't really about steady-state QPS — it's about **surviving a thundering herd against a tiny, hard-capped inventory** without either (a) crashing the DB or (b) selling seat 7A twice.

---

<a name="api"></a>
# 3. API Design *(Part 11)*

```
GET  /api/shows?city=&movieId=&date=
→ 200 [ { showId, theater, time, priceTiers } ]

GET  /api/shows/{showId}/seats
→ 200 { seats: [ { seatId, category, status: AVAILABLE|HELD|BOOKED } ] }

POST /api/shows/{showId}/hold
Body: { seatIds: [...], userId }
→ 200 { holdId, expiresAt }              ← atomic: all seats or none
→ 409 { conflict: [seatIds already taken] }

POST /api/bookings/confirm
Body: { holdId, paymentToken }
→ 201 { bookingId, status: CONFIRMED }
→ 410 { error: "hold expired" }

DELETE /api/holds/{holdId}
→ 204                                     ← explicit release (user backs out)
```

**Idempotency matters here** more than in most APIs: `confirm` must carry an idempotency key (or dedupe on `holdId`) so a retried payment callback can't double-charge or double-confirm.

---

<a name="core"></a>
# 4. Core: distributed inventory consistency 🎯

**Why the LLD answer doesn't survive contact with a fleet:** the LLD design put a lock (or a guarded state field) inside one process's memory. That's fine when there's one instance. The moment you put a **load balancer in front of N app servers**, request A for seat 7A can land on Server 3 while request B for the same seat lands on Server 7. Server 3's in-process lock knows nothing about Server 7. **Two different machines can each believe they hold the lock.** The lock has to move somewhere both servers can see and agree on atomically — a **shared, external, atomic store.**

Two real options:

### Option A — Redis-based distributed lock (`SETNX` / atomic compare-and-swap)
```
SET seat:{showId}:{seatId} {userId} NX EX 600
```
- `NX` = only set if the key doesn't exist → atomic "acquire if free." `EX 600` = auto-expiring TTL (10 min) — the hold self-releases even if the app server crashes mid-checkout (no manual cleanup, no permanently stuck seat).
- Every app server instance talks to the **same** Redis (or Redis Cluster) — so "does another instance already hold this seat" is answered by one atomic operation against shared state, not local memory.
- ✅ **Fast** (sub-ms, in-memory) — survives the flash-sale spike without hammering the primary DB.
- ❌ **Another moving part**: Redis now has to stay consistent *with* the database. If Redis says "held by user X" but the DB write (on confirm) fails or a partition drops the Redis key early, you need reconciliation logic (e.g. the DB write is still the source of truth for *confirmed* bookings; Redis only gates the *hold* phase). Adds an extra failure mode to reason about — Redis down/partitioned means booking is down too (which, per §5, is the accepted trade-off).

### Option B — Database-level optimistic concurrency (version column / CAS on the seat row)
```sql
UPDATE seats
SET status = 'HELD', held_by = :userId, version = version + 1
WHERE seat_id = :seatId AND show_id = :showId
  AND status = 'AVAILABLE' AND version = :expectedVersion;
-- 0 rows updated → someone else got there first → 409 to client
```
- No new infrastructure — the database's own row-level atomicity (or a `version` compare-and-swap) *is* the lock. One instance's `UPDATE` racing another's is resolved by the DB engine itself; whichever transaction commits first wins, the loser's `WHERE` clause matches zero rows and it fails cleanly.
- ✅ **Fewer moving parts** — one source of truth, no cross-system consistency to babysit.
- ❌ **Contention under a flash-sale spike**: 2,000 requests/sec all doing conditional `UPDATE`s against the same small set of ~150 rows means heavy **row-lock contention** — throughput drops exactly when you need it most, and the DB (already the system of record for everything else) becomes the bottleneck.

### The trade-off, stated the way an interviewer wants to hear it
> *"Redis SETNX gives me speed and takes load off the DB during the spike, at the cost of a second system I now have to keep honest against the database. DB-level optimistic locking with a version column keeps a single source of truth and is simpler to reason about, but the same rows getting hammered by thousands of conditional updates a second means contention becomes the bottleneck exactly during the traffic I care most about. For a flash-sale-shaped problem like this, I'd lean Redis for the hold phase — it's built for exactly this kind of hot, short-lived, high-contention key — and let the DB `UPDATE` (also conditioned on status/version, belt-and-suspenders) be the final, authoritative step at *confirm* time, not at *hold* time."*

Either way, the mechanism is the same shape as the LLD file's state machine (`AVAILABLE → HELD → BOOKED`) — it's just that the *thing enforcing the legal transition* moved from an in-process guarded setter to a **shared atomic primitive** (Redis `NX`+`EX`, or a DB CAS) that every app server instance defers to.

---

<a name="cap"></a>
# 5. CAP trade-off *(Part 4)*

This system is a good interview example precisely because **the CAP answer isn't uniform across the whole app** — it's decided *per feature*:

| Path | Choice | Why |
|---|---|---|
| **Booking / seat inventory** | **CP** | Selling the same seat twice is unrecoverable (a customer shows up to a seat someone else is sitting in). During a partition (e.g. can't reach the Redis node or DB primary that owns this seat's lock), **refuse the request** — return 503/409 — rather than accept a write you can't verify is safe. *Rather be down than wrong,* exactly like the bank-ATM example in Part 4. |
| **Show listings / browsing / seat-map display** | **AP** | Showing a seat map that's a few seconds stale (a seat that *just* got held still displaying as green) is a minor UX blip, not a correctness bug — the hold/confirm write path is the actual gatekeeper regardless of what the read replica displayed. Keep browsing available even if a DB replica is lagging or a cache node is partitioned. |

> **Say this out loud in the interview:** *"I don't pick CP or AP for the whole system — I pick it per data path. The write path that touches seat inventory is CP: I'd rather return an error during a partition than risk a double-sell. The read path that shows listings and seat maps is AP: staleness there is cosmetic, and I'd rather stay up and occasionally show a seat as available for a few hundred milliseconds after it's gone, than take the whole browsing experience down."* This mirrors Part 4's quorum idea too — you could even tune it with `R+W > N` on the inventory writes specifically (strong) while leaving listing reads on a low-`R` fast path (eventual).

---

<a name="db"></a>
# 6. Database *(Part 8)*

```
shows(showId PK, movieId, theaterId, screenId, startTime, ...)
seats(showId, seatId, category, status, held_by, version)  PK(showId, seatId)
bookings(bookingId PK, showId, userId, seatIds[], status, paymentId)
```

**Sharding key: `showId` (or `theaterId`, which a show belongs to).**

A single booking transaction **never spans multiple shows** — you never need to atomically update seats for the 6 PM show *and* the 9 PM show in one operation. That means sharding by `showId` gives every booking's read-modify-write entirely **within one shard**:

```
Shard 1: shows/seats for theaters A, B  (showId hash → shard 1)
Shard 2: shows/seats for theaters C, D  (showId hash → shard 2)
```

- ✅ **No distributed/cross-shard transactions needed** for the hot path — the exact property that makes the CAS/optimistic-lock update in §4 a single-shard, single-row operation instead of a 2-phase-commit nightmare.
- **Replication** within each shard: one primary (all seat-status writes) + read replicas (serve the AP browsing path in §5). Failover on the primary preserves the CP guarantee for writes; replicas can lag without breaking anything, per the CAP split above.
- A given flash-sale show only ever hits **one shard's primary** — a hot show can still create a hot shard (see §7), but at least it doesn't fan out writes across the whole cluster.

---

<a name="scaling"></a>
# 7. Scaling — the virtual waiting room *(Part 21)*

Straight-line scaling (LB → stateless app servers → replicas → shard, per the framework) handles steady traffic fine. It does **not** solve the flash-sale spike: 2,000 req/s of *booking attempts* against 150 seats means the vast majority are guaranteed losers — letting all 2,000 hit Redis/DB simultaneously just burns capacity on requests that were always going to fail.

**Virtual waiting room pattern (brief):**
```
[100K users hit "Book Now" at 10:00:00]
        │
[Waiting-room queue]  ← lightweight token/position issuer (Redis list or a queue service)
        │  (admits a controlled trickle, e.g. 200 users/sec)
        ▼
[Booking flow: hold → confirm]  ← only admitted users reach the hot path in §4
```
- Users get a queue position / poll a "your turn" token instead of hammering the booking endpoint directly.
- The booking service (and Redis/DB behind it) only ever sees a **rate-limited, bounded** stream of real attempts, no matter how many people are actually waiting.
- This is the same instinct as Part 13's "queue absorbs the spike, keeps the hot path fast" — just applied to *inbound requests* instead of *outbound side-effects*. It converts an uncontrolled thundering herd into a controlled, capacity-matched drip.
- Combine with **client-side jitter/backoff** and a **CDN-cached** "sold out" response once inventory hits zero, so the tail end of the queue doesn't even reach the app tier.

---

<a name="arch"></a>
# 8. Full architecture diagram

```
[Users — 100K+ during on-sale spike]
        │
      [CDN]                              ← static assets, cached "sold out" page
        │
[Virtual Waiting Room / Queue]           ← throttles admission during flash-sale spikes (Part 13/21)
        │  (bounded, rate-limited trickle)
[Load Balancer]                          ← spread + HA (Part 2.5)
        │
[Stateless App Servers ×N]               ← any instance can serve any request (Part 2)
        │                    │
        │ (browse/read)      │ (hold/confirm — inventory write path)
        ▼                    ▼
[DB Read Replicas]      [Redis: SETNX+TTL seat-hold]   ← shared atomic lock, fast (Part 5.5)
   AP — may lag                │
        │                      ▼
        │              [DB Primary per shard]          ← CAS/optimistic lock, authoritative (Part 8)
        │              shard key = showId/theaterId — no cross-shard txns
        │                      │
        └──────────────────────┴──── [Replication + failover per shard]  (Part 21)

Confirm success → [Queue → payment settlement / notification workers]  (async, Part 13)
```

---

<a name="interview"></a>
# 9. Interview Q&A

### Q: "Your LLD design used a lock on the seat object. Why doesn't that work here?"
> *"That lock only exists inside one process's memory. Once there's a load balancer routing requests to any of N app server instances, two different instances can each think they've locked the same seat because neither knows what the other is holding. The lock has to move into something all instances share and can update atomically — Redis with `SETNX`+TTL, or a compare-and-swap/version check directly against the database row."*

### Q: "Redis SETNX or DB-level optimistic locking — which would you pick, and why?"
> *"Redis is faster and takes the hammering off the database during a spike, but it's a second system I now have to keep consistent with the DB — if Redis says held but the DB write fails, I need reconciliation. DB-level optimistic locking with a version column is simpler — one source of truth — but under a flash-sale spike, thousands of conditional updates hitting the same ~150 rows creates heavy contention right when I need throughput most. I'd use Redis to gate the hold phase, since it's built for hot, short-lived keys, and treat the DB's own conditional update as the final authoritative check at confirm time."*

### Q: "What happens if the Redis node holding the lock goes down mid-hold?"
> *"With TTL-based holds (`EX 600`), the key just expires and the seat becomes bookable again — no manual cleanup, same self-healing property as the LLD version's timer. If it's a Redis Cluster, I'd want the lock key replicated with a wait-for-ack (e.g. Redlock-style multi-node acquire, or accept that a very short window of risk exists) — but for an interview-level answer, stating the TTL self-release and naming the replication risk is enough."*

### Q: "Would you choose CP or AP for this system?"
> *"It depends which part. The seat-inventory write path is CP — I'd rather reject a booking during a partition than risk selling the same seat twice, because that's unrecoverable. But show listings and seat-map browsing can be AP — a seat map that's a second stale is a cosmetic issue, not a correctness one, since the hold/confirm path is the real gatekeeper. I wouldn't pick one CAP stance for the whole system."*

### Q: "How do you shard the database, and why that key?"
> *"By showId, or equivalently theaterId, since a booking transaction never spans two different shows — you never need to atomically touch seats belonging to two shows in one operation. That means the conditional update that holds a seat stays entirely within one shard, so I never need a distributed transaction or two-phase commit on the hot path."*

### Q: "How do you survive 100,000 people trying to book 150 seats the instant tickets go live?"
> *"I don't let all 100,000 reach the booking endpoint. A virtual waiting room admits a rate-limited trickle — say 200/sec — matched to what the Redis/DB layer can actually process, so the vast majority of requests that were always going to fail don't burn capacity on the hot path. It's the same idea as pushing work onto a queue to protect a hot path, just applied to inbound admission instead of outbound side effects."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

- **Shape:** low-QPS steady state, extreme flash-sale spike on a hard-capped, tiny inventory (a few hundred seats vs thousands of req/s).
- **Signature challenge:** the LLD in-process lock doesn't survive multiple app server instances — the lock must move to shared, atomic state.
- **Core fix:** Redis `SETNX`+`EX` (fast, extra moving part to reconcile with DB) **or** DB-level optimistic lock/version CAS (simple, contends hard under spike). Lean Redis for the hold, DB CAS as the authoritative confirm-time check.
- **CAP:** split by feature — booking/inventory writes = **CP** (refuse rather than double-sell); browsing/listings = **AP** (stale is fine).
- **DB:** shard by `showId`/`theaterId` — a booking never spans shows, so no cross-shard transactions on the hot path; replicate per shard for read scale + failover.
- **Scaling the spike:** virtual waiting room / admission queue throttles inbound booking attempts to what the backend can actually process, instead of letting the thundering herd hit Redis/DB directly.
- **TTL holds** self-release on crash/timeout — no manual cleanup, same idea as the LLD version, now backed by Redis `EX` or a DB expiry sweep.
- **Async:** payment settlement/notifications after confirm go through a queue, off the booking hot path.

*— Design Problem 14 complete —*
