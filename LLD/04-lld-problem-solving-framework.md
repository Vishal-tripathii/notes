# 🎯 LLD Problem — Master Framework & Checklist

> **Purpose:** the step-by-step attack plan for ANY low-level design problem (parking lot, elevator, BookMyShow, vending machine…). Work through these stages IN ORDER. **Don't skip the "depth boosters" — they're what separate a basic answer from a senior one.**
>
> **HLD counterpart:** [`System-design/00-DESIGN-PROBLEM-FRAMEWORK.md`](../System-design/00-DESIGN-PROBLEM-FRAMEWORK.md). Same idea, different altitude — HLD asks *"how does this scale across machines,"* LLD asks *"how do you actually build the box."* Every problem in [`LLD/Problems/`](./Problems/) is worked through these 9 steps; reference this file instead of re-deriving them each time.

---

## The 9-step flow (say it out loud, in order)

```
1. Clarify scope         → narrow the vague prompt to 3–4 concrete use-cases
2. Identify actors        → who/what interacts with the system
3. Nouns → classes         → entities become classes, ONE clear responsibility each
4. Verbs → methods          → actions become methods on those classes
5. Relationships & multiplicity → has-a/is-a, 1:1/1:N, draw it before coding
6. Apply patterns             → only where they fit — name the SOLID principle it serves
7. Concurrency & thread-safety 🎯 → the question that separates junior from senior
8. Code the critical path        → the 2–3 methods that matter, real signatures
9. Discuss extensibility          → "now add X" — walk through it without a rewrite
```

---

## 1. Clarify scope
- Interviewers hand you a **deliberately vague** one-liner ("design a parking lot"). Don't start drawing classes yet — narrow it to **3–4 concrete use-cases** first: *"a vehicle enters and gets assigned a spot by type, a vehicle exits and pays by duration, the lot supports multiple floors and vehicle types (bike/car/truck), and we track available-spot counts."*
- Explicitly state what you're **skipping**: payment gateway internals, a reservation-ahead-of-time feature, an admin UI — unless the interviewer says otherwise. Saying it out loud shows control, not evasion.
- ✅ Checkpoint: *"Here are the 3–4 things this system must do, and here's what I'm explicitly NOT building right now."*

## 2. Identify actors
- List **who/what** interacts with the system before you list nouns — actors are where use-case verbs come from. Actors can be human (customer, admin, driver) or systems (payment gateway, sensor, display board).
- ✅ Checkpoint: *"Actor list first — every actor tends to map to at least one verb/method later."*

## 3. Nouns → classes
- Underline the nouns in your use-cases from Step 1; each becomes a candidate class. Each class gets **ONE clear responsibility** (SRP from Part 01) — if you can't describe a class's job in one sentence without "and", it's two classes.
- Example (parking lot): `ParkingLot`, `Floor`, `Spot`, `Vehicle`, `Ticket`, `Payment` — not one `ParkingLot` god-class that also calculates fees and prints tickets.
- ✅ Checkpoint: *"One sentence per class, no 'and'."*

## 4. Verbs → methods
- The actions in your use-cases become methods, and each method lives on the class that **owns the data it needs** (Tell-Don't-Ask, not "ask for the data and decide elsewhere").
- Example: `assignSpot(vehicle)` lives on `ParkingLot` (it owns the spot map), `calculateFee(entryTime, exitTime)` lives on a `PricingStrategy`, not scattered across a controller.
- ✅ Checkpoint: *"Every verb from my use-cases has a home — and it's on the class that owns the relevant state."*

## 5. Relationships & multiplicity *(Part 02 — UML)*
- has-a (aggregation/composition) vs is-a (inheritance) — decide and **draw it** (Part 02) before writing a line of code. This is the step people skip under time pressure, and it's exactly the step that prevents a mid-interview rewrite when a new requirement lands.
- Nail the **multiplicity**: `ParkingLot 1 ── * Floor`, `Floor 1 ── * Spot`, `Ticket 1 ── 1 Vehicle` (while parked). Getting a 1:1 wrong when it's really 1:N is the kind of mistake that only surfaces once you're deep in code.
- ✅ Checkpoint: *"Drawn on paper/whiteboard: boxes, arrows, multiplicity — BEFORE the first class definition."*

## 6. Apply patterns *(Part 03)*
- Apply a pattern **only where it fits naturally** — and always **name the SOLID principle it serves**, not just the pattern name. A pattern you can't justify is a pattern you shouldn't use.
- Examples:
  - **Strategy** for pricing (hourly/flat/premium) → serves **Open/Closed** — swap the algorithm without touching the caller.
  - **Factory** for creating `Vehicle`/`Spot` subtypes → serves **Open/Closed** — new vehicle type doesn't touch existing creation logic.
  - **Observer** for notifying a display board when spot counts change → serves **Open/Closed** — new subscribers plug in without modifying the publisher.
  - **Singleton** for the one `ParkingLot` instance → use sparingly, only where a single shared instance is a genuine system requirement, not a default reach.
- ❌ Anti-pattern: forcing a pattern to show it off. Interviewers notice a Decorator that wraps nothing meaningful.
- ✅ Checkpoint: *"Which pattern, which SOLID principle, and why here specifically — not just 'patterns are good'."*

## 7. Concurrency & thread-safety 🎯 — the senior/junior line
This is the LLD equivalent of the HLD framework's **Core Deep-Dive** step — give it real weight, don't treat it as an afterthought tacked onto the end. Interviewers deliberately probe here **even on "simple" problems** (parking lot, vending machine) because it's the fastest way to tell whether you understand shared mutable state, not just whether you can draw boxes.

The root cause is almost always the same shape: a **check-then-act** sequence (check a condition, then act on it) that isn't atomic, so two threads can both pass the check before either acts.

**Micro-example 1 — two cars, same spot, two entry gates.**
```
Thread A: if (spot.isFree()) { ... }     Thread B: if (spot.isFree()) { ... }
             ▼ both see FREE                          ▼ both see FREE
Thread A: spot.assign(carA)              Thread B: spot.assign(carB)
```
Both threads read `FREE` before either writes — **double-assignment**. Fix: make check-and-set one atomic operation (a `synchronized` block / mutex, or a DB-level `SELECT ... FOR UPDATE` / optimistic locking with a version column and compare-and-swap).
```java
synchronized boolean tryAssign(Spot spot, Vehicle v) {
    if (spot.getStatus() == Status.FREE) {
        spot.setStatus(Status.OCCUPIED);
        spot.setVehicle(v);
        return true;
    }
    return false;   // caller tries the next spot
}
```

**Micro-example 2 — two threads calling `dispense()` on a vending machine.**
Same shape: `if (stock > 0) { stock--; dispenseItem(); }`. Two concurrent calls can both read `stock == 1`, both decrement, both dispense — **oversold by one unit** on the last item. Fix: guard the whole check-then-decrement as one critical section, or use an atomic counter (`AtomicInteger.decrementAndGet()` and reject if it goes negative, restoring it).

**Micro-example 3 — BookMyShow: two users, the last seat.**
Higher-stakes version of the same bug, plus a second wrinkle: you can't hold a lock across an entire payment flow (too slow, blocks everyone). Fix: transition the seat through explicit states with a **compare-and-swap** — `AVAILABLE → LOCKED` only succeeds for one caller — then give the lock a **TTL** (e.g. 5 minutes). If payment completes before the TTL, transition to `BOOKED`; if it expires first, a background sweep (or lazy check on next read) releases it back to `AVAILABLE`. This avoids both overselling AND a seat being stuck locked forever by an abandoned checkout.

- ✅ Checkpoint: *"What's my check-then-act race here, and is it one atomic operation or two?"* — if you can't answer this for your problem, you haven't finished Step 7.

## 8. Code the critical path
- Write the **2–3 methods that are the actual interview signal** — not the whole system, not getters/setters (say "assume standard getters/setters" out loud and move on).
- Example (parking lot): `ParkingLot.parkVehicle(Vehicle v): Ticket` and `ParkingLot.unparkVehicle(Ticket t): Receipt` — with the concurrency guard from Step 7 and the edge cases from the depth-boosters list actually inline, not hand-waved.
- Real types, real signatures — `parkVehicle(v: Vehicle): Ticket`, not `doPark(x)`.
- ✅ Checkpoint: *"These 2–3 methods, if read alone, prove I understand the hard part of this problem."*

## 9. Discuss extensibility
- The interviewer's **"now add X"** is the test of whether Steps 5–6 actually paid off. Walk through the change concretely: *which class changes, and does it require touching tested code, or does it plug in via the pattern you already chose?*
- Example: "now add EV charging spots" — if you used a Factory for spot types, this is a new `ChargingSpot` subclass + one new Factory branch, zero changes to `ParkingLot`'s assignment logic. That's Open/Closed working for you, not just a slogan.
- ✅ Checkpoint: *"Can I add this WITHOUT modifying the classes I already wrote? If yes, my design actually followed OCP — if no, say so honestly and explain the smallest change needed."*

---

## ⭐ DEPTH BOOSTERS — always cover these (the "senior answer" checklist)

These are the points that are easy to forget under time pressure but expected in a strong answer:

- [ ] **Thread-safety mentioned even for "simple" problems** — parking lot, vending machine, LRU cache all have a check-then-act race; say so before the interviewer has to ask.
- [ ] **Name the SOLID principle behind each design choice** — not "I used Strategy" but "I used Strategy here so pricing algorithms are Open for extension, Closed for modification."
- [ ] **At least one pattern applied with justification, never forced** — one well-justified pattern beats three name-dropped ones.
- [ ] **An extensibility walkthrough** — actually narrate the "now add X" instead of waiting to be asked.
- [ ] **Edge cases: empty / full / invalid state** — lot with zero free spots, cache at capacity, vending machine with zero stock, booking a already-booked seat, invalid vehicle type. State how each is handled (reject, queue, throw a typed exception) — don't leave it implicit.

---

## Quick mental template (one-liner per stage)

> **Scope** (3–4 use-cases, name what's out) → **Actors** (who/what) → **Classes** (nouns, one responsibility each) → **Methods** (verbs, owned by the right class) → **Relationships** (has-a/is-a, multiplicity, draw it) → **Patterns** (only where natural + name the SOLID principle) → **Concurrency** 🎯 (find the check-then-act race, make it atomic) → **Code** (2–3 critical methods, real signatures) → **Extend** ("now add X" — plug in, don't rewrite).

---

## Part index

- **[00 — OOP recap](./00-oop-recap.md)** — encapsulation, inheritance vs composition, polymorphism, interface vs abstract class.
- **[01 — SOLID principles](./01-solid-principles.md)** — each letter with a violation + refactor example.
- **[02 — UML basics](./02-uml-basics.md)** — class boxes, the four relationships, sequence diagrams.
- **[03 — Design patterns for LLD](./03-design-patterns-for-lld.md)** — State, Decorator, Adapter, Facade, Command, Chain of Responsibility, Composite, Template Method, Iterator, Proxy.
- **[04 — This framework](./04-lld-problem-solving-framework.md)** — you are here.
- **[Problems/problem-01 — Parking Lot](./Problems/problem-01-parking-lot.md)**
- **[Problems/problem-02 — Elevator System](./Problems/problem-02-elevator-system.md)**
- **[Problems/problem-03 — LRU Cache](./Problems/problem-03-lru-cache.md)**
- **[Problems/problem-04 — Rate Limiter (class-level)](./Problems/problem-04-rate-limiter.md)**
- **[Problems/problem-05 — Vending Machine](./Problems/problem-05-vending-machine.md)**
- **[Problems/problem-06 — Tic-Tac-Toe & Chess](./Problems/problem-06-tic-tac-toe-chess.md)**
- **[Problems/problem-07 — Splitwise / Expense Sharing](./Problems/problem-07-splitwise.md)**
- **[Problems/problem-08 — BookMyShow / Movie Ticket Booking](./Problems/problem-08-bookmyshow.md)**
- **[Problems/problem-09 — Cab Booking / Ride Sharing (Uber LLD)](./Problems/problem-09-cab-booking.md)**
- **[Problems/problem-10 — Logging Framework](./Problems/problem-10-logging-framework.md)**
- **[Problems/problem-11 — Notification System](./Problems/problem-11-notification-system.md)**
- **[Problems/problem-12 — Snake & Ladder (bonus)](./Problems/problem-12-snake-and-ladder.md)**

*— Use this on EVERY LLD problem. —*
