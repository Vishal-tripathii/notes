# 🧩 LLD (Low-Level Design) — Master Roadmap

> **Purpose:** the study plan for the LLD / machine-coding track. New folder — today only [`System-design/22-design-patterns.md`](../System-design/22-design-patterns.md) touches this territory. 17 parts, ordered so foundations (OOP → SOLID → patterns → approach) come before any problem is attempted.
>
> **HLD counterpart:** [`../System-design/00-ROADMAP.md`](../System-design/00-ROADMAP.md).
>
> **The HLD/LLD line, stated once:** HLD asks *"how does this system scale across machines"* — boxes, arrows, a diagram. LLD asks *"how do you actually build the box"* — classes, interfaces, patterns, method contracts. HLD is scrutinized on availability/latency/data-flow; LLD is scrutinized on OOP correctness, SOLID, and whether your design survives the interviewer's "now add feature X" follow-up without a rewrite.
>
> **Target:** be able to take a vague one-line prompt ("design a parking lot"), ask the right narrowing questions, and produce a class diagram + core code in ~35–40 minutes.

---

## How to study each part

```
1. Requirements   → clarify actors + use-cases (interviewers keep this deliberately vague)
2. Nouns → classes → the entities in the problem become your classes
3. Verbs → methods  → the actions become methods on those classes
4. Relationships    → has-a (composition) vs is-a (inheritance), draw it before coding
5. Apply a pattern  → only where it fits naturally — never force one to show it off
6. Code the core    → the 2–3 central classes/methods, not the whole system
7. Extend it        → the interviewer's "now add X" — does your design bend or break?
```

Step 4 is the one people skip under time pressure, and it's the one that prevents the mid-interview rewrite when a new requirement lands. Every problem part below is built around it.

---

## Progress tracker

| # | Part | Priority | Status |
|---|---|---|---|
| 00 | OOP recap | ⭐⭐⭐⭐☆ | ✅ done — [`00-oop-recap.md`](00-oop-recap.md) |
| 01 | SOLID principles | ⭐⭐⭐⭐⭐ | ✅ done — [`01-solid-principles.md`](01-solid-principles.md) |
| 02 | UML basics | ⭐⭐⭐☆☆ | ✅ done — [`02-uml-basics.md`](02-uml-basics.md) |
| 03 | Design patterns for LLD | ⭐⭐⭐⭐⭐ | ✅ done — [`03-design-patterns-for-lld.md`](03-design-patterns-for-lld.md) |
| 04 | The LLD problem-solving framework | ⭐⭐⭐⭐⭐ | ✅ done — [`04-lld-problem-solving-framework.md`](04-lld-problem-solving-framework.md) |
| 05 | Parking Lot | ⭐⭐⭐⭐⭐ | ✅ done — [`Problems/problem-01-parking-lot.md`](Problems/problem-01-parking-lot.md) |
| 06 | Elevator System | ⭐⭐⭐⭐⭐ | ✅ done — [`Problems/problem-02-elevator-system.md`](Problems/problem-02-elevator-system.md) |
| 07 | LRU Cache | ⭐⭐⭐⭐⭐ | ✅ done — [`Problems/problem-03-lru-cache.md`](Problems/problem-03-lru-cache.md) |
| 08 | Rate Limiter (class-level) | ⭐⭐⭐⭐☆ | ✅ done — [`Problems/problem-04-rate-limiter.md`](Problems/problem-04-rate-limiter.md) |
| 09 | Vending Machine | ⭐⭐⭐☆☆ | ✅ done — [`Problems/problem-05-vending-machine.md`](Problems/problem-05-vending-machine.md) |
| 10 | Tic-Tac-Toe & Chess | ⭐⭐⭐☆☆ | ✅ done — [`Problems/problem-06-tic-tac-toe-chess.md`](Problems/problem-06-tic-tac-toe-chess.md) |
| 11 | Splitwise / Expense Sharing | ⭐⭐⭐⭐☆ | ✅ done — [`Problems/problem-07-splitwise.md`](Problems/problem-07-splitwise.md) |
| 12 | BookMyShow / Movie Ticket Booking | ⭐⭐⭐⭐⭐ | ✅ done — [`Problems/problem-08-bookmyshow.md`](Problems/problem-08-bookmyshow.md) |
| 13 | Cab Booking / Ride Sharing (Uber LLD) | ⭐⭐⭐⭐☆ | ✅ done — [`Problems/problem-09-cab-booking-uber.md`](Problems/problem-09-cab-booking-uber.md) |
| 14 | Logging Framework | ⭐⭐⭐☆☆ | ✅ done — [`Problems/problem-10-logging-framework.md`](Problems/problem-10-logging-framework.md) |
| 15 | Notification System | ⭐⭐⭐☆☆ | ✅ done — [`Problems/problem-11-notification-system.md`](Problems/problem-11-notification-system.md) |
| 16 | Snake & Ladder *(bonus)* | ⭐⭐☆☆☆ | ✅ done — [`Problems/problem-12-snake-and-ladder.md`](Problems/problem-12-snake-and-ladder.md) |

> **All 17 parts written.** What's left is not reading — say the ⭐⭐⭐⭐⭐ answers out loud, redo Parking Lot/LRU Cache/BookMyShow from a blank file timed, and actually finish [`work/LRUCache_DLL.js`](../work/LRUCache_DLL.js) using Part 07's reference implementation.

---

# PHASE 0 — Prerequisite

## Part 00 — OOP recap ⭐⭐⭐⭐☆

**Topics:** encapsulation · inheritance vs composition ("has-a" vs "is-a", and why composition is usually the safer default) · polymorphism (compile-time/overloading vs runtime/overriding) · abstraction · interface vs abstract class · why LLD interviews are really "OOP under a time limit."

**Must be able to answer:** composition over inheritance — why · interface vs abstract class, when each · what makes a design "loosely coupled."

---

# PHASE 1 — Foundations

## Part 01 — SOLID principles ⭐⭐⭐⭐⭐

**Topics:** **S**ingle Responsibility · **O**pen/Closed · **L**iskov Substitution · **I**nterface Segregation · **D**ependency Inversion — each with a concrete violation example and the refactor that fixes it, not just the definition.

**Hands-on:** take a deliberately bad "God class" (e.g. an `Order` class that also emails, logs, and calculates tax) and split it until it's SOLID.

**Must be able to answer:** name a violation of each principle from a code snippet, not just recite the acronym.

## Part 02 — UML basics ⭐⭐⭐☆☆

**Topics:** class diagram notation (class box, fields, methods, visibility marks) · association vs aggregation vs composition arrows · sequence diagrams for showing a flow across objects · how much UML to actually draw in a 40-minute interview (enough to communicate, not a formal spec).

**Must be able to answer:** aggregation vs composition, with an example of each from a problem below.

## Part 03 — Design patterns for LLD ⭐⭐⭐⭐⭐

> [`System-design/22-design-patterns.md`](../System-design/22-design-patterns.md) already covers **Singleton, Factory, Builder, Strategy, Observer, Dependency Injection, Repository** — don't re-teach those here, cross-link them. This part adds the patterns that show up constantly in LLD machine-coding but aren't in that file yet.

**Topics:** **State** (vending machine, elevator, order status — objects that change behavior with internal state) · **Decorator** (wrapping behavior, e.g. pizza toppings, coffee add-ons) · **Adapter** (making incompatible interfaces work together) · **Facade** (simplifying a complex subsystem behind one interface) · **Command** (encapsulating a request as an object — undo/redo, queued actions) · **Chain of Responsibility** (logging framework, request middleware) · **Composite** (tree structures — file system, UI components) · **Template Method** (algorithm skeleton with overridable steps) · **Iterator** · **Proxy** (access control, lazy loading, caching wrapper).

**Must be able to answer:** for each pattern, one real system from the problems list below that uses it naturally — not a textbook example.

---

# PHASE 2 — The approach

## Part 04 — The LLD problem-solving framework ⭐⭐⭐⭐⭐

> The LLD equivalent of [`System-design/00-DESIGN-PROBLEM-FRAMEWORK.md`](../System-design/00-DESIGN-PROBLEM-FRAMEWORK.md) — the step-by-step attack plan to run on every problem in Phase 3. Write this one out fully before starting Part 05; every problem part after this should reference it instead of re-deriving the steps.

**The flow to codify:**
```
1. Clarify scope        → narrow the vague prompt to 3-4 concrete use-cases
2. Identify actors       → who/what interacts with the system
3. Nouns → classes        → entities become classes with clear single responsibilities
4. Verbs → methods         → actions on those entities become methods
5. Relationships & multiplicity → has-a/is-a, 1:1/1:N, draw before coding
6. Apply patterns           → only where they fit — name which SOLID principle each choice serves
7. Concurrency & thread-safety → the question that separates junior from senior answers (e.g. two people booking the last seat)
8. Code the critical path        → the 2-3 methods that matter, with real signatures
9. Discuss extensibility          → "now add X" — walk through it without a rewrite
```

**Must be able to answer:** why step 7 (concurrency) gets asked even for "simple" problems like parking lot or vending machine.

---

# PHASE 3 — Classic machine-coding problems

> Work these **on demand**, not strictly in order — but do Parking Lot or LRU Cache first; they're the most commonly used to calibrate a candidate's baseline.

## Part 05 — Parking Lot ⭐⭐⭐⭐⭐

**Topics:** entity modeling (`ParkingLot`, `Floor`, `Spot`, `Vehicle`, `Ticket`) · Strategy for pricing (hourly vs flat vs premium) · Factory for spot/vehicle types · spot-assignment algorithm · concurrency: two vehicles claiming the same spot.

**Must be able to answer:** how do you prevent a double-assigned spot under concurrent entry.

## Part 06 — Elevator System ⭐⭐⭐⭐⭐

**Topics:** State pattern for elevator state (idle/moving-up/moving-down/door-open) · scheduling algorithm (SCAN/look-elevator problem) · multiple elevators + dispatch strategy · concurrency: simultaneous requests from different floors.

**Must be able to answer:** how do you decide which elevator answers a call with N elevators running.

## Part 07 — LRU Cache ⭐⭐⭐⭐⭐

> Existing stubs already in the repo: [`work/LRUCache.js`](../work/LRUCache.js) (Map-based) and [`work/LRUCache_DLL.js`](../work/LRUCache_DLL.js) (doubly-linked-list version, currently empty — this is the part to finish it in).

**Topics:** why O(1) get+put requires hashmap + doubly linked list together · eviction on capacity · `get` promoting an entry to MRU · thread-safety if this cache is shared across requests.

**Hands-on:** finish `LRUCache_DLL.js` for real O(1) operations, then explain why the `Map`-based version in `LRUCache.js` is/isn't equivalent in complexity.

**Must be able to answer:** why a plain array or plain hashmap alone can't hit O(1) for both operations.

## Part 08 — Rate Limiter (class-level) ⭐⭐⭐⭐☆

> Contrast with [`System-design/23-rate-limiting.md`](../System-design/23-rate-limiting.md), which is the *algorithm* (token bucket, sliding window) at HLD/system scale. This part is: design the **class** — interfaces, pluggable strategies, where state lives.

**Topics:** Strategy pattern for swappable algorithms (fixed window/sliding window/token bucket as interchangeable classes) · per-user vs global limiting · thread-safety of the counter.

**Must be able to answer:** how would you let a caller swap the limiting algorithm without changing calling code (this is the SOLID Open/Closed answer).

## Part 09 — Vending Machine ⭐⭐⭐☆☆

**Topics:** the textbook State-pattern problem — states (Idle, HasMoney, Dispensing, OutOfStock) and legal transitions between them · inventory management · State vs a giant if/else/switch (why State wins as states grow).

**Must be able to answer:** what breaks in the if/else version when a new state is added, that doesn't break in the State-pattern version.

## Part 10 — Tic-Tac-Toe & Chess ⭐⭐⭐☆☆

**Topics:** board abstraction that generalizes across board games · win-condition checking as a pluggable Strategy · Chess: piece hierarchy (composition over a deep inheritance tree — a `Piece` interface, not `Pawn extends Piece extends GamePiece extends...`) · move validation.

**Must be able to answer:** why chess piece design is a classic composition-over-inheritance trap.

## Part 11 — Splitwise / Expense Sharing ⭐⭐⭐⭐☆

**Topics:** users, groups, expenses, balances as entities · Strategy for split types (equal/exact/percentage) · debt-simplification algorithm (minimizing number of transactions to settle a group, greedy/graph approach) · consistency of balances after concurrent expense adds.

**Must be able to answer:** how do you simplify N people's mutual debts into the minimum number of payments.

## Part 12 — BookMyShow / Movie Ticket Booking ⭐⭐⭐⭐⭐

**Topics:** `Show`, `Seat`, `Booking`, `Payment` as entities · **concurrency is the whole problem** — seat locking/holding during checkout, preventing double-booking · Observer for booking-confirmation notifications · timeout-based lock release (what if the user abandons checkout).

**Must be able to answer:** how do you hold a seat during payment without permanently locking it if the user never completes checkout.

## Part 13 — Cab Booking / Ride Sharing (Uber LLD) ⭐⭐⭐⭐☆

**Topics:** `Rider`, `Driver`, `Trip`, `Location` as entities · State pattern for trip lifecycle (requested/accepted/ongoing/completed/cancelled) · Strategy for driver-matching (nearest-driver) · Observer for real-time status updates · concurrency: two riders matched to the same driver.

**Must be able to answer:** how do you prevent a driver being double-matched to two trips at once.

## Part 14 — Logging Framework ⭐⭐⭐☆☆

**Topics:** Chain of Responsibility for log-level filtering (DEBUG→INFO→WARN→ERROR handlers) · Strategy for output sinks (console/file/remote) · Singleton for the logger instance (and why that's one of the *legitimate* uses, unlike overusing it elsewhere) · Builder for constructing complex log messages.

**Must be able to answer:** how Chain of Responsibility lets you add a new log level or sink without touching existing handlers.

## Part 15 — Notification System ⭐⭐⭐☆☆

**Topics:** Observer for subscribing users to notification types · Factory for channel selection (email/SMS/push) · Decorator for enriching a notification (add retry, add rate-limiting per user) before it's sent.

**Must be able to answer:** how would you add a new notification channel without modifying the dispatch logic (Open/Closed again).

## Part 16 — Snake & Ladder *(bonus)* ⭐⭐☆☆☆

**Topics:** board + dice + player as entities · snakes/ladders as a `Map<position, position>` jump table · turn management · multi-player extensibility. Lower priority — mostly useful as a quick warm-up problem, not a common real-interview ask.

---

# Interview priority — what to revise last

| Priority | Topics |
|---|---|
| ⭐⭐⭐⭐⭐ | SOLID · The framework (Part 04) · Parking Lot · Elevator · LRU Cache · BookMyShow (concurrency) |
| ⭐⭐⭐⭐☆ | Design patterns (Part 03) · Rate Limiter · Splitwise · Cab Booking |
| ⭐⭐⭐☆☆ | UML · Vending Machine · Tic-Tac-Toe/Chess · Logging · Notifications |
| ⭐⭐☆☆☆ | Snake & Ladder |

If you have one week left: SOLID + the framework + Parking Lot + LRU Cache + BookMyShow — those five carry most LLD loops, because they force State/Strategy/concurrency reasoning that generalizes to everything else on the list.

---

## Revision strategy

- [ ] Say SOLID out loud with a violation+fix example for each letter, no notes.
- [ ] Redo Parking Lot and BookMyShow from a blank file, timed to ~35 min.
- [ ] For every problem marked done, name which pattern(s) it used and *why that one* (not just that a pattern was used).
- [ ] Finish [`work/LRUCache_DLL.js`](../work/LRUCache_DLL.js) for real — it's the one problem in this roadmap with an unfinished stub already sitting in the repo.

---

## Connects to

- **[System-design (HLD) track](../System-design/00-ROADMAP.md)** — Uber and BookMyShow appear on both roadmaps at different altitudes; Part 03 cross-links `System-design/22-design-patterns.md` directly.
- **[work/](../work/)** — `LRUCache.js` / `LRUCache_DLL.js` are live hands-on targets for Part 07, not just references.
- **[scenario-bank/](../scenario-bank/00-README.md)** — no LLD category exists there yet; once a few parts are taught, decide whether LLD scenarios ("what if two threads call `dispense()` at once") get their own folder or fold into `12-concurrency/`.

*— Work through Phase 0–2 before touching a problem in Phase 3; the patterns and framework are what keep a problem from turning into unstructured code-typing. —*
