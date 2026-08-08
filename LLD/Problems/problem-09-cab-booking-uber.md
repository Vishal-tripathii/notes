# LLD Problem 09 — Cab Booking / Ride Sharing (Uber LLD)

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: trip lifecycle as a state machine + preventing a driver being double-matched. Note: **[`../../System-design/`](../../System-design/)** has (or will have) an HLD version of ride-sharing focused on geospatial matching at system scale — this file is the **class design** for trip/driver/rider modeling within one service.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Actors & Entities](#actors)
3. [Class Design](#class-design)
4. [Patterns Applied](#patterns)
5. [Core Code](#code)
6. [Concurrency — the double-match race](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope

**Functional:** rider requests a ride with pickup + drop location → system finds the nearest **available** driver and sends an offer → driver **accepts**/**rejects**/times out (reject/timeout offers the next-nearest driver) → trip proceeds through a strict lifecycle `Requested → Accepted → Ongoing → Completed` → fare calculated on completion (distance/time based, pluggable) → either party can **cancel** while the trip is early enough → rider's app sees live status changes (driver assigned, arriving, trip started/ended) in real time.

**Non-functional (what actually gets probed):**
- **Correctness under concurrency** — a driver must never be locked into two trips at once (the signature challenge — framework step 7).
- **Extensibility** — matching algorithm, fare rules, even "one rider per trip" must be swappable without a rewrite (Open/Closed).
- **Real-time visibility** — rider shouldn't have to poll; state changes push out.

**Explicitly out of scope** (class-design version, not the system-scale HLD version): geospatial indexing of millions of drivers (quadtree/geohash/S2 cells), regional sharding, ETA services — that's the **HLD** ride-sharing problem, one level up in `System-design/`. Payment gateway integration, surge-pricing internals, and driver payout are noted but not modeled.

`MatchingService.findNearestDriver()` here is a **simplified stand-in**: a linear scan over an in-memory list. It proves the *class boundary* is right (Strategy, swappable) — at HLD scale the same interface would be backed by a geospatial index instead of a loop.

---

<a name="actors"></a>
# 2. Actors & Entities

**Actors:** Rider (requests trips), Driver (accepts/rejects/drives trips), the System (matches, tracks state, calculates fare).

**Nouns → Classes** (framework step 3):

| Entity | Responsibility |
|---|---|
| `Rider` | identity + current location + `requestTrip()` |
| `Driver` | identity + vehicle + current location + `status` (AVAILABLE / PENDING_OFFER / ON_TRIP / OFFLINE) + `accept()`/`reject()` |
| `Vehicle` | plate, type — belongs to a `Driver` |
| `Location` | lat/lng/timestamp — the unit both riders and drivers report |
| `Trip` | the aggregate root: rider, driver, pickup, drop, current state, fare, log of location updates over the trip's lifetime |
| `MatchingService` | finds a driver for a trip (Strategy) |
| `FareCalculator` | computes fare from the trip's route/duration (Strategy) |
| `TripService` | orchestrates: match → lock driver → create trip → notify |

---

<a name="class-design"></a>
# 3. Class Design

```
 Rider                         Trip                          Driver
┌─────────────────┐   1  1  ┌─────────────────────┐   1  1  ┌─────────────────┐
│ id, name          │◄────────┤ id, state, fare       │────────►│ id, name          │
│ currentLocation    │ has-a   │ pickup, drop            │  has-a  │ status (AVAILABLE / │
│ requestTrip()       │        │ requestedAt/completedAt   │        │  PENDING_OFFER /     │
└─────────────────┘        │ rider: Rider, driver: Driver│        │  ON_TRIP / OFFLINE)   │
                              │ locationLog: Location[]      │        │ currentLocation         │
                              └────────────┬────────────┘        │ accept()/reject()        │
                                            │ has-many              └────────┬────────────┘
                                            ▼                                  │ has-a 1
                                   ┌─────────────────┐                     ▼
                                   │     Location       │            ┌─────────────────┐
                                   │ lat, lng, timestamp  │            │     Vehicle        │
                                   └─────────────────┘            │ id, type, plate     │
                                                                      └─────────────────┘
```

- **`Trip` has-a `Rider`, has-a `Driver`, has-many `Location`** — exactly the aggregate the prompt calls out. `Trip` is the object everything else (state, matching, notifications) revolves around.
- `Driver` has-a `Vehicle` (composition — a vehicle without a driver record has no purpose in this model).
- `Rider`/`Driver` are otherwise independent — a `Trip` is the join that gives them a relationship, not a direct reference between the two.

---

<a name="patterns"></a>
# 4. Patterns Applied

### State — Trip lifecycle
A `Trip` is a textbook State-pattern candidate: behavior (what actions are legal) changes with the trip's status, and the illegal-transition list only grows as the interviewer adds requirements. Encoding it as `if (state === 'ongoing' && ...)` scattered across methods is the thing State replaces.

```
REQUESTED ──driver accepts──► ACCEPTED ──rider picked up──► ONGOING ──trip ends──► COMPLETED
    │                              │
    └──no driver / rider cancels──►├──rider or driver cancels──► CANCELLED
```
Legal edges only: `REQUESTED→ACCEPTED`, `REQUESTED→CANCELLED`, `ACCEPTED→ONGOING`, `ACCEPTED→CANCELLED`, `ONGOING→COMPLETED`. Everything else (e.g. `COMPLETED→ONGOING`, cancelling a completed trip) is rejected by construction, not by a forgotten `if`.

### Strategy — driver matching
`MatchingService` depends on a `MatchingStrategy` interface, not a concrete algorithm. `NearestDriverStrategy` (simple distance calc) is today's implementation — swap in `WeightedRatingStrategy` later (Section 7) without touching `TripService`. This is also the seam where the **HLD** geospatial-index version plugs in: same interface, different implementation, at a different scale.

### Observer — real-time status push
`Trip` is the subject; the rider's app (and the driver's app) subscribe as observers. Every state transition calls `notifyObservers(event)` — the rider sees "driver assigned," "driver arriving," "trip started" without polling. Decouples `Trip` from *how* a client is notified (websocket, push notification, SMS — doesn't matter to `Trip`).

---

<a name="code"></a>
# 5. Core Code (JavaScript ES6)

```js
// ---------- State pattern: Trip lifecycle ----------
const TRIP_STATES = {
  REQUESTED: 'REQUESTED',
  ACCEPTED:  'ACCEPTED',
  ONGOING:   'ONGOING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

// legal transition table — the single source of truth for what's allowed
const LEGAL_TRANSITIONS = {
  REQUESTED: [TRIP_STATES.ACCEPTED, TRIP_STATES.CANCELLED],
  ACCEPTED:  [TRIP_STATES.ONGOING,  TRIP_STATES.CANCELLED],
  ONGOING:   [TRIP_STATES.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

class Trip {
  constructor(id, rider, driver, pickup, drop) {
    Object.assign(this, {
      id, rider, driver, pickupLocation: pickup, dropLocation: drop,
      state: TRIP_STATES.REQUESTED, locationLog: [], fare: null,
      requestedAt: Date.now(), completedAt: null, observers: [], // observers = Observer pattern
    });
  }

  subscribe(observer) { this.observers.push(observer); }
  notify(event) { for (const obs of this.observers) obs.onTripEvent(this, event); }

  // the enforcement point — every transition MUST go through here
  transitionTo(newState) {
    const allowed = LEGAL_TRANSITIONS[this.state] || [];
    if (!allowed.includes(newState)) {
      throw new Error(`Illegal transition: ${this.state} -> ${newState}`);
    }
    const prev = this.state;
    this.state = newState;
    if (newState === TRIP_STATES.COMPLETED) this.completedAt = Date.now();
    this.notify({ type: 'STATE_CHANGED', from: prev, to: newState });
  }

  addLocationUpdate(location) {
    if (this.state !== TRIP_STATES.ONGOING) return; // only track breadcrumbs mid-trip
    this.locationLog.push(location);
    this.notify({ type: 'LOCATION_UPDATE', location });
  }
}

// ---------- Strategy pattern: driver matching ----------
// simplified stand-in for the HLD geospatial index — plain Euclidean here
const distance = (a, b) => Math.sqrt((a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2);

class NearestDriverStrategy {
  findMatch(riderLocation, availableDrivers) {   // pre-filtered to status === AVAILABLE
    if (availableDrivers.length === 0) return null;
    return availableDrivers.reduce((closest, d) =>
      distance(riderLocation, d.currentLocation) < distance(riderLocation, closest.currentLocation) ? d : closest
    );
  }
}

class MatchingService {
  constructor(strategy = new NearestDriverStrategy()) {
    this.strategy = strategy;          // swap without touching TripService
  }
  findNearestDriver(riderLocation, availableDrivers) {
    return this.strategy.findMatch(riderLocation, availableDrivers);
  }
}

// ---------- Orchestration ----------
class TripService {
  constructor(matchingService, driverRegistry) {
    this.matchingService = matchingService;
    this.driverRegistry = driverRegistry; // owns Driver.status, see Section 6
    this.trips = new Map();
  }

  requestTrip(rider, pickupLocation, dropLocation) {
    const available = this.driverRegistry.getAvailableDrivers();
    const candidate = this.matchingService.findNearestDriver(pickupLocation, available);
    if (!candidate) throw new Error('No drivers available');

    // atomic claim BEFORE the offer goes out — Section 6 explains why this order matters
    const claimed = this.driverRegistry.claimDriver(candidate.id);
    if (!claimed) {
      // lost the race to another request — retry with the next-nearest driver
      return this.requestTrip(rider, pickupLocation, dropLocation);
    }

    const trip = new Trip(cryptoRandomId(), rider, candidate, pickupLocation, dropLocation);
    this.trips.set(trip.id, trip);
    trip.notify({ type: 'OFFER_SENT', driverId: candidate.id });
    return trip;
  }
}

function cryptoRandomId() { return Math.random().toString(36).slice(2); }
```

---

<a name="concurrency"></a>
# 6. Concurrency — the double-match race

**The race, concretely:** Rider A and Rider B both request a ride near the same intersection at nearly the same instant. Driver D is the nearest available driver to both. Both requests call `matchingService.findNearestDriver()` — both reads see `D.status === AVAILABLE` (neither has written yet), so **both** pick D. If the driver's status is only flipped to "unavailable" *after* D accepts, there's a window where D can be offered — or worse, accepted into — two trips at once. That's the double-match: exactly the scenario the roadmap calls out ("how do you prevent a driver being double-matched to two trips at once").

**The naive (buggy) fix — flip status on accept:**
```js
// BUGGY: status only changes when the driver responds
async function offerTrip(driver, trip) {
  const accepted = await sendOfferAndWaitForResponse(driver, trip); // <- await gap!
  if (accepted) driver.status = 'ON_TRIP';
}
```
Between "found nearest driver" and "driver responds," `driver.status` is still `AVAILABLE`. Any request that runs its own match during that window picks the same driver. The bug isn't the `await` itself — it's that the **check** (`status === AVAILABLE`) and the **write** (`status = ON_TRIP`) are split across an async gap, leaving a window for a second request to read the same stale value.

**The fix — atomic claim at match time, not at accept time.** The instant a driver is *proposed* as a match, mark them `PENDING_OFFER` synchronously, in the same tick as the check — so a second concurrent match request sees them as unavailable immediately, long before the driver has actually accepted anything.

```js
class DriverRegistry {
  constructor(drivers) {
    this.drivers = new Map(drivers.map(d => [d.id, d]));
  }

  getAvailableDrivers() {
    return [...this.drivers.values()].filter(d => d.status === 'AVAILABLE');
  }

  // check-and-set done SYNCHRONOUSLY, no await between them — this is the whole fix
  // (a real distributed system does this as a conditional DB update:
  //  UPDATE drivers SET status='PENDING_OFFER' WHERE id=? AND status='AVAILABLE')
  claimDriver(driverId) {
    const driver = this.drivers.get(driverId);
    if (!driver || driver.status !== 'AVAILABLE') return false; // already claimed — lost the race
    driver.status = 'PENDING_OFFER';
    return true;
  }

  // driver accepted -> claim becomes a real trip lock
  confirmDriver(driverId, tripId) {
    const driver = this.drivers.get(driverId);
    driver.status = 'ON_TRIP';
    driver.currentTripId = tripId;
  }

  // driver rejected / timed out -> release back to the pool for the next match
  releaseDriver(driverId) {
    const driver = this.drivers.get(driverId);
    driver.status = 'AVAILABLE';
  }
}
```

Why `claimDriver` before the offer, not after acceptance: the offer round-trip (driver's phone rings, they tap accept/reject) can take seconds — an eternity for a second request racing in. `PENDING_OFFER` closes the window down to a single synchronous statement instead of a whole network round trip. If the driver rejects or the offer times out, `releaseDriver()` puts them back in the pool and `TripService` retries with the next-nearest candidate — the earlier code already falls through to `requestTrip()` recursion when `claimDriver` returns `false`.

At real scale, single-process JS synchronicity isn't enough (multiple app server instances) — the same idea ports directly to a **conditional/optimistic DB update** (`WHERE status = 'AVAILABLE'`) or a distributed lock (Redis `SETNX`/`SET ... NX`) keyed on driver ID. The class-level contract (`claimDriver` returns a boolean, caller must handle `false`) doesn't change either way — that's the part worth stating out loud in the interview.

---

<a name="extensibility"></a>
# 7. Extensibility

**"Now add ride-pooling (multiple riders sharing a trip)."**
- `Trip.rider` (single reference) becomes `Trip.riders: RiderLeg[]`, where each `RiderLeg` pairs a rider with their own pickup/drop and their own sub-state (picked up / dropped off) — the top-level `Trip` state machine (Requested→Accepted→Ongoing→Completed) barely changes, since it still tracks the *vehicle's* journey.
- `MatchingService` needs a different strategy — `PoolingMatchStrategy` scores candidate drivers by route-overlap with an in-progress trip, not just raw distance. Because matching was already behind the `MatchingStrategy` interface (Strategy pattern), this is a new class, not a rewrite of `TripService`.
- `FareCalculator` needs a split strategy (equal/proportional-by-distance) — same shape as the Strategy work in the Splitwise problem (Part 11).
- Vehicle needs a `capacity` field; `TripService` must check remaining capacity before adding a `RiderLeg`.

**"Now add driver ratings affecting matching priority."**
- Add `rating: number` to `Driver`, updated by an `onTripEvent` observer (`RatingService`) when a trip completes.
- Swap `NearestDriverStrategy` for `WeightedScoreStrategy` that combines `distance` and `rating` into one score (e.g. `score = distance * (2 - rating/5)`), still implementing the same `findMatch(riderLocation, availableDrivers)` contract.
- Nothing in `Trip`, `TripService`, or `DriverRegistry` changes — this is the Open/Closed payoff of putting matching behind an interface in the first place.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "How do you prevent a driver being double-matched to two trips at once?"
> *"The race is that two match requests can both read a driver as available before either writes a change — so I don't wait for the driver to accept before locking them. The instant a driver is chosen as a candidate, I atomically flip their status from AVAILABLE to PENDING_OFFER — a check-and-set done in a single synchronous step, so a second concurrent request sees the updated status immediately and falls through to the next-nearest driver instead. At scale that's a conditional DB update — `UPDATE ... WHERE status = 'AVAILABLE'` — or a Redis lock; same contract, different substrate."*

### Q: "Why State pattern instead of a status string with if-checks?"
> *"With a status string, every method that touches the trip needs its own if-else guarding which transitions are legal, and that logic drifts out of sync as states are added — someone forgets to guard `cancel()` against a completed trip. Centralizing the legal-transition table in one place means every transition goes through one enforcement point, and adding a new state (say, DRIVER_ARRIVING) means updating one table, not hunting through every method."*

### Q: "Why Strategy for the matching algorithm instead of hardcoding nearest-driver?"
> *"Because 'nearest driver' is almost never the final answer in a real interview — the follow-up is always 'now factor in rating' or 'now factor in pooling.' If `MatchingService` depends on a `MatchingStrategy` interface rather than a concrete function, I swap the implementation without touching `TripService` or `Trip` at all — that's Open/Closed, and it's also exactly the seam where the HLD version plugs in a geospatial index instead of a linear scan."*

### Q: "What happens if the driver rejects the offer?"
> *"The trip stays in REQUESTED, the driver is released back to AVAILABLE via `releaseDriver()`, and `TripService` re-runs the match against the remaining available drivers, picking the next-nearest. The rider's app gets an Observer notification either way — 'still searching' rather than silence."*

### Q: "How does the rider's app know the trip status changed without polling?"
> *"Trip is the Observer subject — the rider's (and driver's) app subscribe on trip creation. Every `transitionTo()` call fires a notify(), so a websocket or push-notification listener reacts immediately. Trip itself doesn't know or care how the notification is delivered — that's decoupled behind the observer interface."*

### Q: "Could you have flipped the driver's status only after they accept, to keep it simple?"
> *"That's the naive version and it's exactly the bug — the accept round-trip can take seconds while the driver's phone rings, which is a huge window for a second rider's request to also match to that driver. Locking has to happen at the moment of *offering*, not the moment of *accepting*, or the whole point of the lock is defeated."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Entities:** `Rider`, `Driver` (has-a `Vehicle`), `Trip` (has-a `Rider` + has-a `Driver` + has-many `Location`).
- **State:** Trip lifecycle `REQUESTED → ACCEPTED → ONGOING → COMPLETED`, with a `CANCELLED` branch off the first two states. Legal transitions enforced via one table/method, not scattered ifs.
- **Strategy:** `MatchingService` → pluggable `MatchingStrategy` (nearest-driver today; weighted-rating or pooling-aware later; geospatial index at HLD scale).
- **Observer:** `Trip` pushes state-change + location events to subscribed rider/driver app clients — no polling.
- **The signature race:** two riders' requests both matching the same driver. **Fix:** claim the driver (`AVAILABLE → PENDING_OFFER`) atomically the instant they're *proposed* as a match, not after they *accept* — check-and-set with no gap in between (real DB: conditional `UPDATE ... WHERE status = 'AVAILABLE'`).
- **Extensibility:** pooling → `Trip.riders[]` instead of `Trip.rider` + a pooling `MatchingStrategy`; ratings → swap in a `WeightedScoreStrategy`, nothing else in `Trip`/`TripService` changes.
- **Scope line to say out loud:** this file is the *class* design (trip/driver/rider modeling in one service); the HLD version of this problem is about matching at geospatial scale across millions of drivers.

*— LLD Problem 09 complete —*
