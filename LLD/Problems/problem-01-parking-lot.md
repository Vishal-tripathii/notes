# LLD Problem 01 — Parking Lot

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: thread-safe spot assignment under concurrent entry.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Actors & Entities](#actors)
3. [Class Design](#classes)
4. [Patterns Applied](#patterns)
5. [Core Code](#code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope *(Framework Step 1)*

**Functional (in scope):**
1. **Park a vehicle** — on arrival, find an available spot matching the vehicle's size, assign it, issue a ticket with entry time.
2. **Unpark a vehicle** — on exit, look up the ticket, calculate the fee, free the spot, mark it available again.
3. **Calculate fee** — based on duration parked and vehicle type; pricing scheme should be swappable (hourly / flat / premium).
4. **Handle multiple vehicle types** — car, bike/motorcycle, truck — each fits only certain spot sizes (a truck can't fit in a compact spot; a bike shouldn't waste a large spot).
5. **Multiple floors** — the lot is a collection of floors, each with its own spots.
6. **Display available spot count** — per floor and per spot type, so a display board (or API) can show "12 compact spots free on Floor 2."

**Non-functional / the signature challenge:**
- **Thread-safety** — two vehicles arriving at the *same instant* must never be handed the *same* spot. This is the concurrency problem every interviewer probes on this exact question — see [§6](#concurrency).

**Explicitly out of scope** (say this out loud in the interview — it shows you can scope, not just code):
- **Payment gateway integration** — we model a `Payment` entity and compute an `amount`, but we do **not** implement card processing, webhooks, or a payment provider SDK. That's an external system behind an interface.
- **Reservation system** — booking a spot ahead of time is treated as a *follow-up extension* ([§7](#extensibility)), not part of the initial design. Keeping it out up front is what lets the core assignment logic stay simple enough to finish in 35 minutes.

---

<a name="actors"></a>
# 2. Actors & Entities *(Framework Steps 2–3: nouns → classes)*

**Actors:** Driver (parks/unparks a vehicle), Attendant/Admin (monitors availability, occasionally overrides), Display Board (reads availability).

**Nouns in the problem → classes:**

| Noun | Becomes | Notes |
|---|---|---|
| The lot itself | `ParkingLot` | Top-level aggregate root, owns floors |
| A level of the garage | `Floor` | Owns a set of spots |
| A physical space | `ParkingSpot` | Has a `SpotType`, occupancy state |
| Kind of spot | `SpotType` (enum) | `COMPACT`, `LARGE`, `HANDICAPPED` |
| The thing being parked | `Vehicle` (base) | Abstract — never instantiated directly |
| | `Car`, `Bike`, `Truck` | Subclasses, each declares which `SpotType`s it fits |
| Proof of entry | `Ticket` | Vehicle + Spot + entry time (issued at park) |
| The bill | `Payment` | Ticket + amount + status (settled at unpark) |

> Note the vehicle → spot fit isn't 1:1 by name. A `Bike` fits `COMPACT`, `LARGE`, or a dedicated small spot; a `Car` fits `COMPACT` or `LARGE`; a `Truck` fits only `LARGE`. Model this as "each vehicle knows which spot types it can use," not "each spot type has one fixed vehicle type" — that's what makes the assignment algorithm a simple lookup instead of a chain of `if` statements.

---

<a name="classes"></a>
# 3. Class Design *(Framework Steps 3–5)*

### `ParkingLot`
- **Fields:** `id`, `name`, `floors: Floor[]`, `spotLocks: Map<spotId, Mutex>` *(see §6)*
- **Methods:** `addFloor(floor)`, `parkVehicle(vehicle): Ticket`, `unparkVehicle(ticket): Payment`, `getAvailableSpotCount(spotType): number`

### `Floor`
- **Fields:** `floorNumber`, `spots: ParkingSpot[]`
- **Methods:** `findAvailableSpot(vehicle): ParkingSpot | null`, `getAvailableCount(spotType): number`

### `ParkingSpot`
- **Fields:** `id`, `floorNumber`, `spotType: SpotType`, `isOccupied: boolean`, `vehicle: Vehicle | null`
- **Methods:** `assign(vehicle)`, `vacate()`, `canFit(vehicle): boolean`

### `SpotType` (enum)
- `COMPACT` · `LARGE` · `HANDICAPPED`

### `Vehicle` (abstract base)
- **Fields:** `licensePlate`, `type`
- **Methods:** `getAllowedSpotTypes(): SpotType[]` — the polymorphic hook each subclass overrides
- **Subclasses:** `Car` → `[COMPACT, LARGE]`, `Bike` → `[COMPACT, LARGE, HANDICAPPED]` *(fits anywhere, prefer smallest)*, `Truck` → `[LARGE]`

### `Ticket`
- **Fields:** `id`, `vehicle: Vehicle`, `spot: ParkingSpot`, `entryTime: Date`, `exitTime: Date | null`
- **Methods:** `getDurationHours(): number`

### `Payment`
- **Fields:** `id`, `ticket: Ticket`, `amount`, `status: 'PENDING' | 'PAID'`, `method`
- **Methods:** `settle()`

### ASCII Class Diagram

```
┌───────────────┐        composition (1 ── *)        ┌───────────┐
│  ParkingLot   │ ─────────────────────────────────►  │   Floor   │
│ + floors[]    │                                      │ + spots[] │
│ + parkVehicle │                                      └─────┬─────┘
│ + unparkVeh   │                                            │ composition (1 ── *)
└───────────────┘                                            ▼
                                                        ┌──────────────┐
                                                        │ ParkingSpot  │◄────┐
                                                        │ + spotType   │     │ built by
                                                        │ + isOccupied │     │ SpotFactory
                                                        │ + assign()   │     │ (creational)
                                                        └──────┬───────┘     │
                                                               │ association (1─1, while parked)
                       ┌─────────────┐  association            │
                       │   Vehicle   │◄────────────────────────┤
                       │  (abstract) │                          │
                       └──────┬──────┘                    ┌─────▼──────┐
              ┌───────┬───────┼────────┐                  │   Ticket   │
              ▼       ▼       ▼        ▼                  │ + entryTm  │
            Car     Bike   Truck   (built by               │ + spot     │
                              VehicleFactory)               │ + vehicle  │
                                                             └─────┬──────┘
                                                                   │ association (1─1)
                                                                   ▼
                                                             ┌────────────┐        uses
                                                             │  Payment   │ ─────────────► PricingStrategy
                                                             │ + amount   │              (Strategy pattern)
                                                             └────────────┘
```

**Relationships, named explicitly (interviewers check this):**
- `ParkingLot` **has-many** `Floor` → **composition** (a floor cannot exist without its lot; destroy the lot, destroy the floors).
- `Floor` **has-many** `ParkingSpot` → **composition** (same lifecycle argument).
- `Ticket` **has-a** `Vehicle` + **has-a** `ParkingSpot` → **association** (both objects exist independently of the ticket; the ticket just links them for the duration of the stay).
- `Vehicle` → `Car`/`Bike`/`Truck` → **inheritance** (is-a).

---

<a name="patterns"></a>
# 4. Patterns Applied *(Framework Step 6 — name the SOLID principle each choice serves)*

### Strategy — pricing
Fee calculation is swappable: hourly, flat-rate, premium (e.g. weekend surge). Each is a class implementing `calculateFee(ticket)`, injected into `ParkingLot` or `Payment` at construction time.
> **SOLID tie: Open/Closed Principle.** Adding a "member discount" pricing scheme means writing one new class — zero changes to `ParkingLot`, `Ticket`, or `Payment`. The system is open for extension, closed for modification.

### Factory — spot & vehicle creation
`SpotFactory.createSpot(type, floorNumber)` and `VehicleFactory.createVehicle(type, plate)` centralize the "which concrete class do I instantiate" decision instead of scattering `new Car(...)` / `new Truck(...)` calls (and their construction quirks) across the codebase.
> **SOLID tie: Single Responsibility Principle.** `ParkingLot` is responsible for *orchestrating parking*, not for knowing the construction details of every vehicle/spot subtype — that responsibility is isolated in the factory. It's also a second Open/Closed win: adding `SpotType.EV_CHARGING` touches the factory, not the assignment algorithm ([§7](#extensibility)).

*(Not used, and worth saying why if asked: Singleton for `ParkingLot` is tempting but usually a trap — a real deployment might run multiple lot instances in tests or multiple physical lots in one process; inject the instance instead of hard-coding global state.)*

---

<a name="code"></a>
# 5. Core Code *(Framework Step 8 — the 2–3 methods that matter)*

```javascript
// ---------- Enums & Vehicles ----------
const SpotType = Object.freeze({ COMPACT: 'COMPACT', LARGE: 'LARGE', HANDICAPPED: 'HANDICAPPED' });

class Vehicle {
  constructor(licensePlate) { this.licensePlate = licensePlate; }
  getAllowedSpotTypes() { throw new Error('override in subclass'); }
}
class Car extends Vehicle {
  getAllowedSpotTypes() { return [SpotType.COMPACT, SpotType.LARGE]; }
}
class Bike extends Vehicle {
  getAllowedSpotTypes() { return [SpotType.HANDICAPPED, SpotType.COMPACT, SpotType.LARGE]; }
}
class Truck extends Vehicle {
  getAllowedSpotTypes() { return [SpotType.LARGE]; }
}

// ---------- ParkingSpot ----------
class ParkingSpot {
  constructor(id, floorNumber, spotType) {
    this.id = id;
    this.floorNumber = floorNumber;
    this.spotType = spotType;
    this.isOccupied = false;
    this.vehicle = null;
  }
  canFit(vehicle) { return vehicle.getAllowedSpotTypes().includes(this.spotType); }
  assign(vehicle) { this.isOccupied = true; this.vehicle = vehicle; }
  vacate() { this.isOccupied = false; this.vehicle = null; }
}

// ---------- Floor ----------
class Floor {
  constructor(floorNumber, spots) { this.floorNumber = floorNumber; this.spots = spots; }

  findAvailableSpot(vehicle) {
    // smallest-fit-first: prefer the tightest matching spot so LARGE spots
    // stay free for vehicles that truly need them
    const candidates = this.spots.filter(s => !s.isOccupied && s.canFit(vehicle));
    if (candidates.length === 0) return null;
    const order = [SpotType.COMPACT, SpotType.HANDICAPPED, SpotType.LARGE];
    candidates.sort((a, b) => order.indexOf(a.spotType) - order.indexOf(b.spotType));
    return candidates[0];
  }

  getAvailableCount(spotType) {
    return this.spots.filter(s => !s.isOccupied && s.spotType === spotType).length;
  }
}

// ---------- Ticket ----------
class Ticket {
  constructor(id, vehicle, spot) {
    this.id = id;
    this.vehicle = vehicle;
    this.spot = spot;
    this.entryTime = new Date();
    this.exitTime = null;
  }
  getDurationHours() {
    const end = this.exitTime ?? new Date();
    return Math.max(1, Math.ceil((end - this.entryTime) / (1000 * 60 * 60))); // round up, min 1hr
  }
}

// ---------- Pricing (Strategy) ----------
class HourlyPricingStrategy {
  calculateFee(ticket) {
    const rates = { COMPACT: 20, LARGE: 30, HANDICAPPED: 10 };
    return ticket.getDurationHours() * rates[ticket.spot.spotType];
  }
}

// ---------- ParkingLot: the orchestrator ----------
class ParkingLot {
  constructor(pricingStrategy = new HourlyPricingStrategy()) {
    this.floors = [];
    this.pricingStrategy = pricingStrategy;
    this.activeTickets = new Map(); // ticketId -> Ticket
    this._ticketSeq = 0;
  }

  addFloor(floor) { this.floors.push(floor); }

  parkVehicle(vehicle) {
    for (const floor of this.floors) {
      const spot = floor.findAvailableSpot(vehicle);
      if (!spot) continue;
      // NAIVE version — race condition lives right here between "find" and
      // "assign". Fixed with an atomic claim in §6.
      spot.assign(vehicle);
      const ticket = new Ticket(++this._ticketSeq, vehicle, spot);
      this.activeTickets.set(ticket.id, ticket);
      return ticket;
    }
    throw new Error('Parking lot full for this vehicle type');
  }

  unparkVehicle(ticketId) {
    const ticket = this.activeTickets.get(ticketId);
    if (!ticket) throw new Error('Invalid ticket');
    ticket.exitTime = new Date();
    const amount = this.pricingStrategy.calculateFee(ticket);
    ticket.spot.vacate();
    this.activeTickets.delete(ticketId);
    return { ticketId, amount, status: 'PENDING' }; // Payment shape
  }

  getAvailableSpotCount(spotType) {
    return this.floors.reduce((sum, f) => sum + f.getAvailableCount(spotType), 0);
  }
}
```

---

<a name="concurrency"></a>
# 6. Concurrency 🎯 *(Framework Step 7 — the question that separates junior from senior)*

## The race condition, concretely

`parkVehicle` above does two separate steps: **(1) find** an available spot, **(2) assign** it. Between those steps, nothing stops a second thread/request from *also* finding the same spot still marked `isOccupied = false`.

```
Time  Vehicle A (Thread 1)              Vehicle B (Thread 2)
----  ---------------------------------  ---------------------------------
t0    floor.findAvailableSpot(car)
      → returns Spot #42 (free)
t1                                        floor.findAvailableSpot(car)
                                           → ALSO returns Spot #42 (still
                                             marked free — A hasn't
                                             written yet!)
t2    spot42.assign(vehicleA)
t3                                        spot42.assign(vehicleB)  ← BUG
                                           Spot #42 now "belongs" to B,
                                           silently overwriting A's ticket.
                                           Two cars, one spot, on paper.
```

This is the classic **check-then-act** race: reading `isOccupied` and writing it are two operations, not one, so two threads can both pass the check before either writes. It's the same shape as the "two people booking the last seat" problem in BookMyShow — parking lot is just the smallest version of it, which is exactly why interviewers use it as the calibration question.

## The fix: make the claim atomic

The read-check-write has to become **one indivisible operation**. Two equivalent ways to say this depending on deployment:

**A) In-process — a lock per spot (mutex).** Don't lock the whole lot (that would serialize every park/unpark across the entire garage — a huge throughput hit). Lock only the specific spot being claimed, so unrelated spots can be assigned in parallel.

```javascript
class ParkingSpot {
  constructor(id, floorNumber, spotType) {
    this.id = id;
    this.floorNumber = floorNumber;
    this.spotType = spotType;
    this.isOccupied = false;
    this.vehicle = null;
    this._locked = false; // simple per-spot mutex flag
  }

  canFit(vehicle) { return vehicle.getAllowedSpotTypes().includes(this.spotType); }

  // Atomic claim: returns true only if THIS call is the one that flips
  // the spot from free -> occupied. Anyone else calling concurrently
  // gets false and must retry a different spot.
  tryClaim(vehicle) {
    if (this._locked) return false;        // already being claimed by someone else
    this._locked = true;                    // enter critical section
    try {
      if (this.isOccupied) return false;    // re-check inside the lock
      this.isOccupied = true;
      this.vehicle = vehicle;
      return true;
    } finally {
      this._locked = false;                 // always release
    }
  }
}
```

```javascript
// ParkingLot.parkVehicle, race-safe version
parkVehicle(vehicle) {
  for (const floor of this.floors) {
    let spot = floor.findAvailableSpot(vehicle);
    while (spot) {
      if (spot.tryClaim(vehicle)) {
        const ticket = new Ticket(++this._ticketSeq, vehicle, spot);
        this.activeTickets.set(ticket.id, ticket);
        return ticket;
      }
      // lost the race — someone else grabbed it between find() and claim();
      // retry with the next candidate instead of failing outright
      spot = floor.findAvailableSpot(vehicle);
    }
  }
  throw new Error('Parking lot full for this vehicle type');
}
```

> In JavaScript's single-threaded event loop this specific flag trick is somewhat academic (no true preemption mid-statement), but the **pattern** — collapse check+write into one atomic operation, retry on failure — is exactly what you'd implement with `synchronized` in Java, a `Lock`/`Semaphore`, or `pthread_mutex` in C++, and it's what the interviewer is grading.

**B) Multi-instance / DB-backed — compare-and-swap.** If multiple app servers share one database of spots (real deployments), an in-process lock doesn't help — two different servers each hold their own memory. Use the database's atomicity instead:

```sql
UPDATE parking_spots
SET is_occupied = true, vehicle_id = :vehicleId
WHERE id = :spotId AND is_occupied = false;
-- check rows affected: 1 → you won the claim; 0 → someone else did, retry another spot
```

This is a **compare-and-swap** (CAS): "set it to occupied *only if* it's still free," enforced by the database's row-level locking, so it's correct even across many servers with no shared memory. Same idea as an optimistic-concurrency version-column check.

---

<a name="extensibility"></a>
# 7. Extensibility *(Framework Step 9 — "now add X" without a rewrite)*

## "Now add electric vehicle charging spots"

**What changes:**
- Add `SpotType.EV_CHARGING` to the enum.
- Extend `ElectricVehicle` (or add an `isElectric` flag to `Vehicle`) so `getAllowedSpotTypes()` can include it.
- `SpotFactory` gains a branch to build an `EV_CHARGING` spot (maybe a small `ChargingSpot extends ParkingSpot` subclass carrying `chargerType`, `powerKw`).

**What does NOT change:**
- `Floor.findAvailableSpot()` — it already just filters `spots` by `canFit(vehicle)`; a new enum value flows through the exact same filter/sort logic with zero edits.
- `ParkingSpot.tryClaim()` — the atomic-claim mechanism is spot-type-agnostic; the concurrency fix from §6 protects every spot type automatically.
- `ParkingLot.parkVehicle()` — the orchestration loop is untouched.

This is the Open/Closed payoff from §4 made concrete: the *shape* of the assignment algorithm never had a `switch(spotType)` in it, so new spot types are additive, not invasive.

## "Now add a reservation system"

**What changes:**
- New `Reservation` class: `{ id, vehicle, spot, reservedFrom, reservedUntil, status }`.
- `ParkingSpot` gains a third state beyond occupied/free: `RESERVED` (or keep it boolean but check an active-reservation list before offering the spot in `findAvailableSpot`).
- `ParkingLot.parkVehicle()` gains a branch: if the arriving vehicle has an active reservation, go straight to that reserved spot (skip the search); otherwise fall back to the normal `findAvailableSpot` + `tryClaim` path.
- A background sweep (or lazy check on read) to expire reservations that were never claimed — same "abandoned checkout" shape as the BookMyShow seat-hold problem.

**What does NOT change:**
- `ParkingSpot.tryClaim()` — reservations are just another caller of the same atomic claim; you don't need a second concurrency mechanism, you reuse the one you already built.
- The pricing `Strategy` interface — a reservation is just a `Ticket` created slightly differently; fee calculation doesn't care how the spot was obtained.
- `Floor`/`ParkingLot` composition structure — reservations are metadata layered on top of existing spots, not a new spatial hierarchy.

The pattern across both extensions: **the core assignment + concurrency primitives were designed generic enough (filter-by-capability, atomic-claim-by-spot) that new requirements slot in as new callers or new enum values — never as edits to the critical path.** That's the concrete proof, in an interview, that step 5 (relationships before code) and step 6 (patterns, not ad-hoc logic) paid off.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Walk me through what happens when a car arrives."
> *"The lot iterates its floors, and for each floor asks for an available spot that fits the car — compact or large, smallest-fit-first so I don't waste large spots on small vehicles. Once I find a candidate, I don't just mark it occupied directly — I call an atomic `tryClaim`, because between finding the spot and assigning it, another car could have grabbed it. If the claim fails I retry with the next candidate. Once claimed, I generate a `Ticket` with the entry timestamp and hand it back."*

### Q: "How do you prevent two cars from getting the same spot?"
> *"The bug is check-then-act — one thread reads 'spot is free,' another thread reads the same 'free' before the first thread writes 'occupied.' I collapse that into one atomic operation: a per-spot lock that re-checks occupancy *inside* the critical section before writing, so only one caller can ever successfully claim a given spot, and I lock per-spot rather than per-lot so unrelated parking events aren't serialized. If this were multiple app servers against a shared database instead of one process, I'd use a compare-and-swap update — `UPDATE ... WHERE is_occupied = false` — and check rows-affected to know if I won the claim."*

### Q: "Why not just lock the whole parking lot for every park/unpark?"
> *"Correctness-wise it would work, but it kills throughput — every unrelated request queues up behind one global lock even when they're touching completely different spots on different floors. Locking at the spot level gives the same safety guarantee with far more parallelism, which matters once you're modeling hundreds of spots being claimed concurrently."*

### Q: "How would you support different vehicle types cleanly?"
> *"`Vehicle` is an abstract base with `Car`, `Bike`, `Truck` subclasses, each overriding `getAllowedSpotTypes()`. The spot-finding logic never branches on vehicle type explicitly — it just calls `canFit()`, which checks the vehicle's allowed types against the spot's type. That's what lets me add a new vehicle type later without touching `Floor` or `ParkingLot` at all."*

### Q: "How is pricing structured, and why?"
> *"Strategy pattern — `PricingStrategy` is an interface with one method, `calculateFee(ticket)`, and I inject a concrete implementation (`HourlyPricingStrategy`, `FlatRatePricingStrategy`, `PremiumPricingStrategy`) into the lot. That's Open/Closed: adding a new pricing scheme, like a weekend-surge rate, is a new class, not a modification to `ParkingLot` or `Ticket`."*

### Q: "The interviewer says: now add EV charging spots. What do you do?"
> *"I add `EV_CHARGING` to the `SpotType` enum and let an electric vehicle's `getAllowedSpotTypes()` include it. The factory learns to build that spot type. Nothing else changes — `findAvailableSpot` already filters generically by `canFit()`, and the atomic-claim concurrency fix already applies to every spot regardless of type. That's the direct payoff of not hard-coding spot types into the assignment logic in the first place."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Scope:** park, unpark, calculate fee, multi vehicle-type, multi-floor, availability display. Out of scope: payment gateway internals, reservations (handled as an extension).
- **Entities:** `ParkingLot` → `Floor` → `ParkingSpot` (composition chain); `Vehicle`(abstract) → `Car`/`Bike`/`Truck` (inheritance); `Ticket` associates `Vehicle` + `ParkingSpot`; `Payment` associates `Ticket`.
- **Assignment algorithm:** filter spots by `canFit(vehicle)`, prefer smallest matching `SpotType` first.
- **Patterns:** Strategy for pricing (Open/Closed); Factory for spot/vehicle creation (Single Responsibility + Open/Closed).
- **Concurrency — the signature problem:** check-then-act race between "find free spot" and "mark occupied." Fix = atomic `tryClaim()` (per-spot lock, re-check inside critical section) in-process, or `UPDATE ... WHERE is_occupied=false` compare-and-swap across servers. Lock per-spot, never per-lot (throughput).
- **Extensibility test:** EV charging spots = new enum value + factory branch, zero change to `findAvailableSpot`/`tryClaim`/`parkVehicle`. Reservations = new `Reservation` class reusing the same atomic-claim primitive, zero new concurrency mechanism.
- **The generalizable lesson:** model capability-based fit (`canFit`) instead of type-switch logic, and centralize the atomic state transition in one place — every future "now add X" becomes a new caller, not a rewrite.

*— LLD Problem 01 complete —*
