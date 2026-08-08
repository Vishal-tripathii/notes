# LLD Problem 08 — BookMyShow / Movie Ticket Booking

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: **seat-locking under concurrent booking** — this is THE concurrency-heaviest problem in the LLD track, give it real weight. Note: **[`../../System-design/Problems/`](../../System-design/Problems/)** also has an HLD version of ticket booking (system-scale, inventory consistency across machines) — this file is the **class design for ONE booking service instance**.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Actors & Entities](#entities)
3. [Class Design](#class-design)
4. [Patterns Applied](#patterns)
5. [Core Code](#core-code)
6. [Concurrency 🎯](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope *(Framework Step 1)*

**Functional:**
1. Browse movies/shows by city, theater, date.
2. View a show's **seat map** (available / locked / booked, per seat category).
3. **Select seats** and start checkout.
4. **Hold** the selected seats for a short window while the user pays (industry standard: ~5–10 min).
5. **Complete payment** → hold converts to a confirmed booking.
6. **Release the hold** automatically if the timer expires, or immediately if the user cancels/backs out.

**Non-functional (the ones that shape the design):**
- **No double-booking** — two users must never end up holding/booking the *same* seat for the *same* show. This is the design's center of gravity.
- **No permanently stuck seats** — an abandoned checkout must free the seat without manual intervention.
- Reasonable **fairness** — first user to lock a seat wins; the second gets a clear rejection, not a hang.

**Explicitly out of scope for this file:** payment gateway internals, multi-datacenter inventory sync, search/ranking of shows (all HLD-track concerns — see the cross-referenced ticket-booking HLD problem).

> Framing for the interviewer: *"The functional surface here is simple CRUD-ish browsing. The entire design conversation is going to be about the seat-hold lifecycle and concurrency — that's where I'll spend most of my time."*

---

<a name="entities"></a>
# 2. Actors & Entities *(Framework Steps 2–3)*

**Actors:** `Customer` (browses, books), *(optionally)* `Admin` (creates shows) — kept out of the class diagram, not core to the machine-coding ask.

**Nouns → Classes:**

| Entity | Responsibility |
|---|---|
| `Movie` | title, duration, language, genre — static catalog data |
| `Theater` | name, location, has-many `Screen` |
| `Screen` | belongs to a `Theater`, has a fixed seating layout |
| `Show` | a `Movie` playing on a `Screen` at a specific time; has-many `Seat` (the bookable inventory for *that* showtime) |
| `Seat` | belongs to a `Show`; has a category (Silver/Gold/Premium) and a `SeatStatus` |
| `SeatStatus` | enum: `AVAILABLE` → `LOCKED` → `BOOKED` (and back to `AVAILABLE`) |
| `User` | id, name, contact — who's booking |
| `Booking` | has-many `Seat`, has-a `User`, has-a `Payment`, has a status (`PENDING`/`CONFIRMED`/`CANCELLED`) |
| `Payment` | amount, method, status — attached to a `Booking` |

**Key design decision — seats belong to a `Show`, not a `Screen`.** A `Screen` has a fixed physical layout (rows/columns), but *availability* is per-showtime. Modeling `Seat` as a child of `Show` means each showtime gets its own independent inventory — the 6 PM show and 9 PM show on the same screen don't fight over the same `Seat` objects. (The physical layout is read from `Screen` once, when a `Show` is created, to instantiate that show's `Seat` set.)

---

<a name="class-design"></a>
# 3. Class Design *(Framework Steps 4–5)*

```
Theater 1───* Screen 1───* Show 1───* Seat
                                       │ status: SeatStatus
                                       │ (AVAILABLE|LOCKED|BOOKED)
                                       │
                                       * (many seats per booking)
                                       │
User 1───* Booking *───1 Payment
              │
              └── seats: Seat[]   (the seats this booking claimed)
              └── status: PENDING | CONFIRMED | CANCELLED

Movie 1───* Show          (a movie has many showtimes)
```

**Multiplicities that matter:**
- `Show` **has-many** `Seat` — composition; seats don't outlive their show.
- `Booking` **has-many** `Seat` + **has-a** `User` + **has-a** `Payment` — composition for seats (a booking owns its seat references), association for `User`/`Payment`.
- `Seat.status` is the single field every concurrent request is racing to mutate — flagged now because it drives §6.

---

<a name="patterns"></a>
# 4. Patterns Applied *(Framework Step 6)*

### Observer — booking-confirmation notifications
When a `Booking` transitions to `CONFIRMED`, notify subscribers (email service, SMS service, analytics) without `BookingService` knowing about any of them concretely.
```javascript
class BookingService {
  constructor() { this.observers = []; }
  subscribe(observer) { this.observers.push(observer); }
  notifyConfirmed(booking) {
    this.observers.forEach(o => o.update(booking));
  }
}
class EmailNotifier { update(booking) { /* send email */ } }
class SmsNotifier   { update(booking) { /* send sms */ } }
```
**Why it fits:** adding a new channel (push notification) is Open/Closed — new observer class, zero changes to `BookingService`.

### State — `Seat` status transitions
`AVAILABLE → LOCKED → BOOKED`, with `LOCKED → AVAILABLE` on timeout/cancel. This is a small enough state machine that many teams just use an enum + guarded setter rather than full State-pattern classes per status — but the **legal-transition table** is the important artifact either way:

| From | To | Trigger |
|---|---|---|
| `AVAILABLE` | `LOCKED` | user selects seat, lock acquired |
| `LOCKED` | `BOOKED` | payment confirmed, lock still held by same user |
| `LOCKED` | `AVAILABLE` | TTL expiry, or user cancels checkout |
| `BOOKED` | `AVAILABLE` | booking cancelled/refunded (not covered in depth here) |

Any transition not in this table is rejected — e.g. `BOOKED → LOCKED` directly is illegal, which is exactly what stops double-booking (§6).

### Strategy — payment methods (discussion only)
`PaymentStrategy` interface with `CardPayment`, `UpiPayment`, `WalletPayment` implementations; `Payment` holds a strategy reference and calls `strategy.pay(amount)`. Mentioned for completeness — not the core of this problem, so kept to a paragraph, not a code block. The interviewer cares far more that you *recognize* it as a Strategy slot than that you implement three payment classes.

---

<a name="core-code"></a>
# 5. Core Code *(Framework Step 8)*

## `SeatLockManager` — TTL-based hold

```javascript
class SeatLockManager {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
    // key: `${showId}:${seatId}` → { userId, expiresAt }
    this.locks = new Map();
  }

  /**
   * Attempts to lock every seat in seatIds for userId.
   * All-or-nothing: if ANY seat is unavailable, none are locked.
   * Returns { success, failedSeatIds }.
   */
  lockSeats(showId, seatIds, userId) {
    this._sweepExpired(showId, seatIds);

    const failed = seatIds.filter(seatId => {
      const key = `${showId}:${seatId}`;
      const existing = this.locks.get(key);
      return existing && existing.userId !== userId; // held by someone else
    });

    if (failed.length > 0) {
      return { success: false, failedSeatIds: failed };
    }

    const expiresAt = Date.now() + this.ttlMs;
    seatIds.forEach(seatId => {
      this.locks.set(`${showId}:${seatId}`, { userId, expiresAt });
    });
    return { success: true, failedSeatIds: [] };
  }

  isLockedBy(showId, seatId, userId) {
    const lock = this.locks.get(`${showId}:${seatId}`);
    if (!lock) return false;
    if (Date.now() > lock.expiresAt) return false; // lazily expired
    return lock.userId === userId;
  }

  release(showId, seatIds, userId) {
    seatIds.forEach(seatId => {
      const key = `${showId}:${seatId}`;
      const lock = this.locks.get(key);
      if (lock && lock.userId === userId) this.locks.delete(key);
    });
  }

  _sweepExpired(showId, seatIds) {
    const now = Date.now();
    seatIds.forEach(seatId => {
      const key = `${showId}:${seatId}`;
      const lock = this.locks.get(key);
      if (lock && now > lock.expiresAt) this.locks.delete(key);
    });
  }
}
```

> **HLD cross-reference:** this in-memory `Map` is a single-process stand-in for what **Redis `SET key value NX PX ttlMs`** does at system scale — `NX` (set-if-not-exists) gives the atomic compare-and-set across *many* app servers, and `PX` gives the TTL, in one atomic command. The class-design job here is to get the *contract* right (atomic check-and-lock, TTL-bound, ownership-checked release); swapping the `Map` for a Redis client later doesn't change a single method signature.

## `BookingService.confirmBooking()` — validate the lock before finalizing

```javascript
class BookingService {
  constructor(seatLockManager, paymentGateway) {
    this.lockManager = seatLockManager;
    this.paymentGateway = paymentGateway;
    this.observers = [];
  }

  confirmBooking(showId, seatIds, userId, paymentDetails) {
    // 1. Re-validate: does THIS user still hold the lock on every seat?
    const stillHeld = seatIds.every(seatId =>
      this.lockManager.isLockedBy(showId, seatId, userId)
    );
    if (!stillHeld) {
      throw new Error('Hold expired or lost — reselect seats.');
    }

    // 2. Charge. If this fails, seats stay LOCKED until TTL — user can retry.
    const payment = this.paymentGateway.charge(paymentDetails);
    if (payment.status !== 'SUCCESS') {
      throw new Error('Payment failed.');
    }

    // 3. Finalize: LOCKED → BOOKED, and release the lock entry (no longer needed).
    const booking = new Booking(userId, seatIds, payment, 'CONFIRMED');
    seatIds.forEach(seatId => this._markSeatBooked(showId, seatId));
    this.lockManager.release(showId, seatIds, userId);

    this.notifyConfirmed(booking);
    return booking;
  }

  _markSeatBooked(showId, seatId) { /* persist Seat.status = BOOKED */ }
  notifyConfirmed(booking) { this.observers.forEach(o => o.update(booking)); }
}
```

**Why the re-check in step 1 matters:** without it, a lock that expired *between* seat-selection and payment-click would let a user pay for a seat someone else has since locked or booked — the exact bug §6 is about.

---

<a name="concurrency"></a>
# 6. Concurrency 🎯 *(Framework Step 7 — the central section)*

This is the question the whole problem exists to ask. Two people click the same seat within milliseconds — what actually happens?

## Problem 1: the double-lock race

**The naive, broken version** — "check then set," two separate operations:

```javascript
// ❌ BROKEN — race condition
lockSeat(showId, seatId, userId) {
  const seat = this.getSeat(showId, seatId);
  if (seat.status === 'AVAILABLE') {        // ← CHECK
    // ... time passes: thread scheduler, network, GC pause, anything ...
    seat.status = 'LOCKED';                 // ← SET
    seat.lockedBy = userId;
    return true;
  }
  return false;
}
```

Walk the interleaving:
```
Time  User A thread                User B thread
t0    read seat.status → AVAILABLE
t1                                  read seat.status → AVAILABLE   ← both see AVAILABLE!
t2    write status = LOCKED (A)
t3                                   write status = LOCKED (B)     ← overwrites A's lock!
```
Both requests passed the check *before either had written*. **Check-then-set is two operations with a gap in the middle** — anything can happen in that gap (a context switch, a second CPU core running B's code in parallel, a GC pause). Result: seat silently reassigned from A to B, or in a worse variant, both users proceed to payment for the same physical seat and you discover the double-booking only when two ticket QR codes work at the same theater door.

**The fix — collapse check-and-set into one atomic operation.** The point isn't "add a mutex somewhere," it's that *the read and the write must be indivisible* — no other thread can observe or act between them. Two equivalent ways to get there:

**Option A — atomic compare-and-swap on the seat status:**
```javascript
// ✅ FIXED — single atomic operation, no gap for another thread to land in
lockSeat(showId, seatId, userId) {
  // Map.set with a guard evaluated in one synchronous JS turn IS atomic in
  // Node's single-threaded event loop — no other JS runs between the read
  // and the write inside this function body.
  const key = `${showId}:${seatId}`;
  const current = this.locks.get(key);
  const isFree = !current || Date.now() > current.expiresAt;
  if (!isFree) return false;                 // still a "check"...
  this.locks.set(key, { userId, expiresAt: Date.now() + this.ttlMs }); // ...but
  return true;   // no OTHER thread can run between the check and this set
}
```
The code *looks* the same shape as the broken version — the difference is the execution model guarantees no other request's code can interleave between the `get` and the `set`. In JS/Node this is free (single-threaded event loop, no preemption mid-function). In a multi-threaded language, or across multiple processes/servers, you need an actual atomic primitive: a DB `UPDATE ... WHERE status = 'AVAILABLE'` (the `WHERE` clause makes the whole read-modify-write one atomic statement, and you check `rowsAffected` to know if you won) or `SET key value NX` in Redis.

**Option B — a real mutex/lock around the critical section**, used when the runtime *can* preempt mid-check (multi-threaded server):
```javascript
async lockSeat(showId, seatId, userId) {
  await mutex.acquire(`${showId}:${seatId}`);
  try {
    if (seat.status !== 'AVAILABLE') return false;
    seat.status = 'LOCKED';
    return true;
  } finally {
    mutex.release(`${showId}:${seatId}`);
  }
}
```
Same principle, different mechanism: force the check-then-set to run as one uninterruptible unit for a given seat key.

**The generalizable interview answer:** *"Any time two requests can 'check' the same thing before either 'sets' it, you have a race. The fix is never 'add more checks' — more checks with gaps between them just move the race, they don't close it. The fix is making the check-and-set a single atomic operation: DB conditional update, Redis `SET NX`, or a lock scoped to that exact seat key."* Naming the seat-key-scoped lock matters — a single global lock would serialize *all* seat bookings across *all* shows, which is correct but throws away all concurrency you don't need to give up.

## Problem 2: the abandoned checkout

Seat gets `LOCKED` correctly. User closes the tab, loses signal, or just never pays. Without a fix, that seat is **locked forever** — worse than double-booking, because now the seat is unsellable to *anyone*, not just contested.

**Fix: every lock carries a TTL** (`expiresAt = now + holdWindow`, e.g. 5–10 minutes), exactly as `SeatLockManager` does above. But a TTL sitting in a data structure doesn't *do* anything by itself — something has to act on it. Two complementary mechanisms, and interviewers want you to name **both**:

1. **Lazy expiry on read** — every time a lock is *checked* (`lockSeats`, `isLockedBy`), first test `Date.now() > expiresAt` and treat it as free if so. This guarantees correctness — a stale lock can never block a new booking, no matter how long it's sat there — but only cleans up entries that get *looked at again*. A seat nobody else ever tries to book leaves its dead entry sitting in the map indefinitely.

2. **Background sweep** — a periodic job (`setInterval` in-process, or a scheduled worker at system scale) scans for `expiresAt < now` and deletes those entries / flips the seat back to `AVAILABLE` proactively. This is what actually bounds memory growth and — importantly — is what makes the seat show up as available again **in the UI without anyone else having to try to book it first**. Lazy expiry alone means the seat map still *shows* the seat as locked to a third user browsing the show, even though the lock is functionally dead; the sweep is what closes that visibility gap.

```javascript
class SeatLockManager {
  // ...
  startBackgroundSweep(intervalMs = 30_000) {
    setInterval(() => {
      const now = Date.now();
      for (const [key, lock] of this.locks.entries()) {
        if (now > lock.expiresAt) {
          this.locks.delete(key);
          this._markSeatAvailable(key); // flip Seat.status back for the UI
        }
      }
    }, intervalMs);
  }
}
```

**Why you need both, stated as the interview soundbite:** *"Lazy expiry guarantees correctness on the read path — a dead lock can never wrongly block a booking. The background sweep guarantees liveness — it's what actually frees the seat for other users to see and select, instead of waiting for someone to stumble into the stale entry. Correctness without the sweep is safe but feels broken to users; the sweep without lazy expiry is a race window between sweeps."* This exact pairing — lazy expiry + active sweep — is also literally how Redis itself expires keys internally, so citing that at HLD scale reinforces the same idea travels up a layer.

## Third-order concern worth one sentence

Payment can itself fail or hang *after* the lock check passes in `confirmBooking`. The design in §5 handles this by **not releasing the lock until the seat is actually marked `BOOKED`** — if payment fails, the lock (and its TTL) is simply left in place, so the user gets to retry within the same hold window instead of losing the seat to a race the instant payment declines.

---

<a name="extensibility"></a>
# 7. Extensibility *(Framework Step 9)*

### "Now add group booking with better seats together"
- Extend seat selection to accept a **quantity + preference** ("4 seats together") instead of explicit seat IDs.
- Add a `SeatFinder` strategy (`Strategy` pattern again) that scans the `Show`'s seat map for a contiguous run of N `AVAILABLE` seats in the requested category, then hands the resulting seat IDs to the *existing* `SeatLockManager.lockSeats()` unchanged.
- **Why the design absorbs this cleanly:** `lockSeats` already takes an array of seat IDs and locks them all-or-nothing — group booking is just a smarter way of *producing* that array, not a change to the locking contract. This is the payoff of having designed `lockSeats` as all-or-nothing over a set from the start.

### "Now add a waitlist for sold-out shows"
- New entity `WaitlistEntry { userId, showId, seatCategory, timestamp }`.
- When a `Booking` is **cancelled** (seat transitions `BOOKED → AVAILABLE`), that's a natural **Observer** hook: a `WaitlistNotifier` observer subscribed to cancellation events checks for a matching waitlist entry (same show, same/lower category) in timestamp order and offers that user a short-lived lock — reusing `SeatLockManager.lockSeats()` again, just triggered by a cancellation event instead of a user click.
- **Why the design absorbs this cleanly:** the Observer pattern chosen in §4 for booking-confirmation notifications generalizes directly — cancellation is just another event with its own observer list, and the seat-hold mechanics don't need to know a waitlist exists at all.

Both extensions land without touching `SeatLockManager`'s core contract or `Seat`'s state machine — which is the tell that the original modeling (seats as a `Show`-scoped resource, locking as an atomic all-or-nothing operation, state transitions as an explicit table) was drawn at the right seams.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Walk me through what happens when two users try to book the same seat at the same time."
> *"Both requests hit `lockSeats` for the same show/seat. The key thing is the check ('is this seat free?') and the set ('mark it locked') have to happen as one atomic operation — otherwise both requests can read 'available' before either writes 'locked,' and you get a double-lock. I'd implement that as a DB conditional update (`UPDATE ... WHERE status='AVAILABLE'`, checking rows-affected) or a Redis `SET NX` at scale — whichever request's atomic operation wins, the other gets a clean rejection back immediately, not a hang."*

### Q: "What's wrong with `if (seat.status === 'AVAILABLE') { seat.status = 'LOCKED' }`?"
> *"That's a check-then-set with a gap in between — a read followed by a separate write. Between the read and the write, another thread, process, or server can run the exact same check, also see 'available,' and also proceed to lock. The fix isn't more checks, it's making the check-and-set indivisible: one atomic instruction, or a lock scoped to that specific seat key so no other request's code can interleave."*

### Q: "A user locks a seat and then closes the browser tab. What happens to that seat?"
> *"Every lock is created with a TTL — I store `expiresAt` alongside the lock. Two mechanisms release it: lazy expiry, where any future check of that lock treats it as free once `now > expiresAt`, which guarantees correctness; and a background sweep that periodically scans for expired locks and proactively flips the seat back to available. I need both — lazy expiry alone would leave the seat showing as locked in the UI to anyone browsing, even though a new booking attempt would technically succeed once it hit that stale entry."*

### Q: "Why not just delete the lock the moment payment starts, to avoid holding it too long?"
> *"Because payment isn't instant and can fail partway through — a gateway timeout, a declined card. If I released the lock before payment resolves, another user could grab the seat while this user's payment is still in flight, and then a successful payment would have nothing to confirm. I keep the lock held through the entire payment attempt and only release it on explicit success (seat becomes `BOOKED`) or explicit failure/TTL (seat reopens) — never speculatively in between."*

### Q: "How would this change if you had multiple booking-service instances behind a load balancer?"
> *"The in-memory `Map` in `SeatLockManager` stops working the moment there's more than one process, because two instances would each have their own map and neither would see the other's locks — right back to the double-lock race, just across processes instead of threads. I'd move the lock store to something shared and atomic — Redis `SET key value NX PX ttl` gives me the same atomic-check-and-TTL contract but visible to every instance. The class design and method signatures in `SeatLockManager` don't change at all — only the storage backend does."*

### Q: "Why model `Seat` as belonging to `Show` instead of `Screen`?"
> *"A `Screen`'s physical layout is fixed, but seat *availability* is per-showtime — the 6 PM and 9 PM shows on the same screen need completely independent inventory. If `Seat` belonged to `Screen`, I'd need a separate availability table per show anyway, which is really just re-deriving a `Show`-scoped seat set through a side door. Modeling `Seat` under `Show` directly means the locking and status logic only ever has to reason about one show's seats at a time."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Entities:** `Movie → Show → Seat` (composition, per-showtime inventory); `Booking has-many Seat + has-a User + has-a Payment`.
- **SeatStatus:** `AVAILABLE → LOCKED → BOOKED`, `LOCKED → AVAILABLE` on TTL/cancel — table of legal transitions, reject anything else.
- **Patterns:** Observer (booking-confirmed notifications, reused for waitlist-on-cancel), State (seat status), Strategy (payment methods, seat-finder for group booking).
- **Core contract:** `lockSeats()` is all-or-nothing across a seat array; `confirmBooking()` re-validates the caller still holds every lock before charging.
- **Race #1 — double-lock:** check-then-set has a gap another request can land in → fix by making check-and-set **one atomic operation** (DB conditional `UPDATE`, Redis `SET NX`, or a per-seat-key mutex). Never "add more checks."
- **Race #2 — abandoned checkout:** every lock carries a **TTL**. Need **both** lazy expiry (correctness on read) **and** a background sweep (liveness — frees the seat for others to *see*, not just book).
- **Payment failure:** don't release the lock speculatively before payment resolves — hold through success/failure/TTL only.
- **Scale-out:** swap the in-memory `Map` for Redis `SET NX PX` — same method contract, shared atomic store across instances.
- **Extensibility tell:** group booking and waitlist both reuse `lockSeats()`/Observer unchanged — sign the original seams (atomic all-or-nothing lock, event-based notification) were drawn correctly.

*— LLD Problem 08 complete —*
