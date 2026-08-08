# LLD Problem 02 — Elevator System

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: dispatch scheduling across multiple elevators + concurrent floor requests.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Actors & Entities](#actors)
3. [Class Design](#classes)
4. [Patterns Applied](#patterns)
5. [Core Code](#code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extend)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope *(Framework step 1)*

**Functional:**
1. A building has **N floors** and **M elevators** running in parallel.
2. **External requests** — a hall button on each floor: **UP** and/or **DOWN** (ground floor only has UP, top floor only DOWN).
3. **Internal requests** — once inside, a rider presses a destination-floor button.
4. Doors **open automatically** on arrival, stay open briefly, then **close** — unless blocked or overloaded.
5. **Weight-limit alarm** — if load exceeds capacity, buzzer sounds and doors will not close.

**Non-functional:**
- **Minimize wait time** — pick the elevator that serves a call soonest, not just the first free one.
- **Fairness** — no floor/request starves forever behind a busier one.
- **Thread-safety** — many hall/internal requests can arrive "simultaneously" while several elevators are mid-transit; no request gets silently dropped or double-assigned.
- **Extensible** — new elevator types (express) and modes (maintenance) shouldn't require touching the dispatch core.

**Out of scope:** real physics (acceleration/deceleration curves, motor control), animated floor displays, fire/emergency recall mode (mentioned only as a possible extension), power-outage handling.

> Multiple elevators + concurrent requests → **scheduling/dispatch is the core problem**, not movement itself. Everything below is organized around that.

---

<a name="actors"></a>
# 2. Actors & Entities *(Framework steps 2–3: nouns → classes)*

| Entity | Responsibility |
|---|---|
| **Building** | Owns the set of `Floor`s and `Elevator`s; entry point that wires everything together. |
| **Floor** | Has a floor number + up/down hall buttons; raises an external `Request` when pressed. |
| **Elevator** | The state machine — current floor, direction, door state, destination stops, load. |
| **ElevatorController / Dispatcher** | Owns all elevators; decides *which* elevator answers a call (the scheduling algorithm lives here). |
| **Request** | Either **external** `{floor, direction}` (hall call — direction of *travel* the rider wants) or **internal** `{elevatorId, destinationFloor}` (button pressed from inside a specific car). |
| **Door** | open()/close(), reports back to `Elevator` whether it's safe to move. |
| **Display (Observer)** | Subscribes to an elevator's position/state to show it on each floor. |

**Verbs → methods:** `pressHallButton`, `pressFloorButton` → `requestElevator(floor, direction)`, `selectFloor(elevatorId, floor)` → `addDestination(floor)` → `transition(state)`, `move()`/`step()`, `openDoors()`, `closeDoors()`, `checkWeight()`, `notifyObservers()`.

---

<a name="classes"></a>
# 3. Class Design *(Framework steps 3–5: fields, methods, relationships)*

```
Elevator
├─ id: number
├─ currentFloor: number
├─ state: ElevatorState        (Idle | MovingUp | MovingDown | DoorOpen)
├─ direction: Direction        (UP | DOWN | IDLE)
├─ capacityKg / currentLoadKg
├─ upStops: Set<number>        (pending destinations above current floor)
├─ downStops: Set<number>      (pending destinations below current floor)
├─ observers: Display[]
├─ transition(newState)
├─ addDestination(floor)
├─ step() / arrive()
├─ openDoors() / closeDoors()
└─ subscribe(observer) / notifyObservers()

ElevatorController
├─ elevators: Elevator[]
├─ schedulingStrategy: SchedulingStrategy
├─ requestElevator(floor, direction) → elevatorId   (external hall call)
└─ selectFloor(elevatorId, floor)                    (internal button press)

SchedulingStrategy (interface)
└─ selectElevator(elevators, floor, direction) → Elevator

Floor
├─ number
├─ upButton / downButton
└─ pressButton(direction) → controller.requestElevator(...)

Building
├─ floors: Floor[]      (1 : N)
└─ elevators: Elevator[] (1 : N, via controller)
```

**ASCII relationship diagram:**

```
        1        N
Building ───────────── Floor
   │  1                     │ raises
   │                        ▼
   │  N              ┌─────────────┐
   └───────────────▶ │ Elevator    │◀── addDestination ── ElevatorController
                      └─────────────┘        (1 : N, "has-many")
                                              │
                                    processes Request queue
                                    via SchedulingStrategy (has-a)
```

`Building` **has-a** list of `Elevator`s and `Floor`s (composition — an elevator doesn't outlive its building). `ElevatorController` **has-a** `SchedulingStrategy` (composition, swappable at runtime — classic Strategy/DIP). `Elevator` **has-a** current `ElevatorState` (State pattern, swapped at runtime, never subclassed per-state).

---

<a name="patterns"></a>
# 4. Patterns Applied *(Framework step 6)*

## State — elevator status
An `Elevator` behaves differently depending on whether it's idle, moving, or doors-open — instead of an `if/else` ladder checking a `status` string everywhere, each status is its own class implementing a common `ElevatorState` interface. Adding a state (e.g. `MaintenanceState`) later means **adding a class**, not editing every method that branches on status (Open/Closed Principle).

**Transition diagram** (an elevator can only reverse direction *at a stop*, never mid-flight — mirrors real elevators):

```
              addDestination(floor > current)
        ┌───────────────────────────────────┐
        │                                    ▼
   ┌─────────┐  addDestination(floor < current)  ┌────────────┐
   │  IDLE   │◀──────────────────────────────────│ MOVING_DOWN│
   └────┬────┘                                    └─────▲──────┘
        │                                                │
        │ addDestination(floor > current)          arrive()
        ▼                                                │
   ┌────────────┐        arrive()             ┌──────────┴───┐
   │ MOVING_UP  │────────────────────────────▶ │  DOOR_OPEN   │
   └────────────┘                              └───┬───┬──────┘
        ▲                                           │   │
        │            closeDoorsAndProceed()         │   │
        └───────────────────────────────────────────┘   │
                     (if upStops pending)                │
        MOVING_DOWN ◀──────────────────────────────────┘
                     (if downStops pending, else → IDLE)
```

Illegal by design: `MOVING_UP → MOVING_DOWN` directly. The car must pass through `DOOR_OPEN` (i.e. stop) before reversing.

## Strategy — dispatch algorithm
`ElevatorController` doesn't hard-code "pick nearest elevator." It holds a `SchedulingStrategy` interface, satisfied by `NearestElevatorStrategy` (simple, good baseline) or `ScanStrategy` (real-world "LOOK" elevator algorithm — prefer a car already sweeping toward the call). Swapping the algorithm never touches `ElevatorController` — pure Open/Closed + Dependency Inversion.

## Observer — floor displays
Each `Elevator` keeps a list of subscribers (`FloorDisplay`s, or a monitoring dashboard). On every floor change or state change it calls `notifyObservers()`. Displays don't poll the elevator; they're pushed updates — decouples "the car moved" from "who cares that it moved."

---

<a name="code"></a>
# 5. Core Code *(Framework step 8 — the critical path)*

```js
// ---- Direction enum ----
const Direction = Object.freeze({ UP: 'UP', DOWN: 'DOWN', IDLE: 'IDLE' });

// ---- State pattern ----
class ElevatorState { name() { return 'State'; } }
class IdleState       extends ElevatorState { name() { return 'IDLE'; } }
class MovingUpState   extends ElevatorState { name() { return 'MOVING_UP'; } }
class MovingDownState extends ElevatorState { name() { return 'MOVING_DOWN'; } }
class DoorOpenState   extends ElevatorState { name() { return 'DOOR_OPEN'; } }

// Adjacency list of legal next-states — this IS the diagram above, enforced in code.
const LEGAL_TRANSITIONS = {
  IDLE:        ['MOVING_UP', 'MOVING_DOWN', 'DOOR_OPEN'],
  MOVING_UP:   ['MOVING_UP', 'DOOR_OPEN'],          // no direct reversal
  MOVING_DOWN: ['MOVING_DOWN', 'DOOR_OPEN'],
  DOOR_OPEN:   ['IDLE', 'MOVING_UP', 'MOVING_DOWN'],
};

class Elevator {
  constructor(id, capacityKg = 800) {
    this.id = id;
    this.currentFloor = 0;
    this.state = new IdleState();
    this.direction = Direction.IDLE;
    this.capacityKg = capacityKg;
    this.currentLoadKg = 0;
    this.upStops = new Set();     // pending stops above currentFloor
    this.downStops = new Set();   // pending stops below currentFloor
    this.observers = [];
  }

  subscribe(observer) { this.observers.push(observer); }
  notifyObservers() {
    for (const o of this.observers) {
      o.onElevatorUpdate(this.id, this.currentFloor, this.state.name());
    }
  }

  // Only allow moves the LEGAL_TRANSITIONS table permits.
  transition(newState) {
    const allowed = LEGAL_TRANSITIONS[this.state.name()] || [];
    if (!allowed.includes(newState.name())) {
      throw new Error(`Illegal transition: ${this.state.name()} -> ${newState.name()}`);
    }
    this.state = newState;
    this.direction =
      newState.name() === 'MOVING_UP'   ? Direction.UP   :
      newState.name() === 'MOVING_DOWN' ? Direction.DOWN : Direction.IDLE;
    this.notifyObservers();
  }

  addDestination(floor) {
    if (floor > this.currentFloor) this.upStops.add(floor);
    else if (floor < this.currentFloor) this.downStops.add(floor);
    if (this.state.name() === 'IDLE' && floor !== this.currentFloor) {
      this.transition(floor > this.currentFloor ? new MovingUpState() : new MovingDownState());
    }
  }

  step() { // one simulated tick
    if (this.state.name() === 'MOVING_UP') {
      this.currentFloor++;
      this.notifyObservers();
      if (this.upStops.has(this.currentFloor)) this.arrive();
    } else if (this.state.name() === 'MOVING_DOWN') {
      this.currentFloor--;
      this.notifyObservers();
      if (this.downStops.has(this.currentFloor)) this.arrive();
    }
  }

  arrive() {
    this.transition(new DoorOpenState());
    this.upStops.delete(this.currentFloor);
    this.downStops.delete(this.currentFloor);
    this.openDoors();
  }

  openDoors() {
    if (this.currentLoadKg > this.capacityKg) {
      console.warn(`Elevator ${this.id} overloaded — buzzer on, doors held open.`);
      return; // door will NOT close until load drops
    }
    setTimeout(() => this.closeDoorsAndProceed(), 3000);
  }

  closeDoorsAndProceed() {
    if (this.upStops.size > 0)        this.transition(new MovingUpState());
    else if (this.downStops.size > 0) this.transition(new MovingDownState());
    else                               this.transition(new IdleState());
  }
}

// ---- Strategy pattern: pluggable dispatch algorithms ----
class NearestElevatorStrategy {
  selectElevator(elevators, floor) {
    return elevators
      .filter(e => e.state.name() !== 'MAINTENANCE')
      .reduce((best, e) =>
        Math.abs(e.currentFloor - floor) < Math.abs(best.currentFloor - floor) ? e : best
      );
  }
}

class ScanStrategy {
  selectElevator(elevators, floor, direction) {
    // Prefer a car already sweeping toward `floor` in the requested direction —
    // it can pick the call up "on the way" at ~zero extra cost.
    const enRoute = elevators.find(e =>
      e.direction === direction && e.state.name() !== 'MAINTENANCE' &&
      ((direction === Direction.UP   && e.currentFloor <= floor) ||
       (direction === Direction.DOWN && e.currentFloor >= floor))
    );
    return enRoute || new NearestElevatorStrategy().selectElevator(elevators, floor);
  }
}

// ---- Dispatcher ----
class ElevatorController {
  constructor(elevators, schedulingStrategy) {
    this.elevators = elevators;
    this.strategy = schedulingStrategy;   // injected — Strategy + DIP
  }

  // External hall call — direction is the direction the WAITING rider wants to travel.
  requestElevator(floor, direction) {
    const chosen = this.strategy.selectElevator(this.elevators, floor, direction);
    chosen.addDestination(floor);
    return chosen.id;
  }

  // Internal button press, once the rider is already inside a specific car.
  selectFloor(elevatorId, destinationFloor) {
    const elevator = this.elevators.find(e => e.id === elevatorId);
    elevator.addDestination(destinationFloor);
  }
}
```

---

<a name="concurrency"></a>
# 6. Concurrency *(Framework step 7)*

**The scenario:** floor 2 presses UP and floor 7 presses DOWN at nearly the same instant, while Elevator A is mid-transit between floors. Two problems to avoid:

1. **Stale-read double assignment.** If `selectElevator` reads `elevator.currentFloor`/`state` to score candidates, and two requests are scored *before either commits* an assignment, both can independently conclude "Elevator A is best" and both call `addDestination` — not itself wrong (both stops legitimately get added), but if the two calls conflict on **direction** (one wants A to go up, one wants it committed down) you can strand a state where A can't legally serve both without an inefficient detour. Fix: treat **read-candidates + write-assignment as one critical section** per elevator — a lock/mutex around `selectElevator → addDestination` (in Java, `synchronized` on the elevator, or a per-elevator queue actor). In this JS sketch it's naturally atomic because Node's event loop processes one call to `requestElevator` to completion before the next — but that guarantee **disappears** the moment you add `await` inside it (e.g. an async DB write mid-function), so the critical section must be explicit, not accidental.
2. **Lost updates on the stop sets.** `upStops`/`downStops` are mutated from multiple request handlers. Using per-elevator `Set`s (not a shared global structure) keeps the blast radius to one elevator; still, each mutation should happen inside the same lock as (1).

## Worked SCAN example — 3 pending requests

Elevator is at **floor 5**, already **moving UP** with one internal stop queued at **floor 9**. Two hall calls arrive:

| Request | Floor | Direction |
|---|---|---|
| R1 (internal, already queued) | 9 | UP |
| R2 (hall call) | 4 | DOWN |
| R3 (hall call) | 2 | UP |

**SCAN/LOOK logic:** keep moving in the current direction, serving every stop *in that direction* first; only reverse once there are no more requests ahead; opposite-direction requests behind the car wait for the return sweep.

```
Current: floor 5, direction UP
  5 → 6 → 7 → 8 → 9   : R1 served (was already ahead, in-direction)   ── reverse only now
  9 → 8 → 7 → 6 → 5 → 4 : R2 served (DOWN call, now in-direction)
  R3 (floor 2, wants UP) is BELOW the car and its direction doesn't match
  the current DOWN sweep → NOT served yet.
  4 → 3 → 2 → 1        : continue down to the lowest pending stop
  1 → 2                 : reverse UP → R3 finally served
```

Order of service: **9 → 4 → 2**. Without SCAN (naive FCFS: serve requests in arrival order), the car would ping-pong 5→9→4→2 with no ordering discipline, or worse, reverse direction mid-corridor — which the `MOVING_UP → MOVING_DOWN` illegal transition in the State machine physically prevents anyway. SCAN is what keeps average wait time low across many concurrent requests instead of just "correct."

---

<a name="extend"></a>
# 7. Extensibility *(Framework step 9 — "now add X")*

## "Now add an express elevator that skips some floors"
- **Changes:** add a `servesFloor(floor)` method to `Elevator` (default: always `true`); an `ExpressElevator` either overrides it with an allow-list/skip-list, or a plain `Elevator` gets a `servedFloors: Set<number>|null` field. `SchedulingStrategy.selectElevator` filters candidates with `elevators.filter(e => e.servesFloor(floor))` before scoring.
- **Doesn't change:** `ElevatorController`, the `State` machine, `transition()`, door/weight logic — none of them know or care that a floor is skippable. This is exactly the Strategy/OCP payoff from Section 4: the filter is additive at the boundary where candidates are chosen, not woven through the core.

## "Now add a maintenance mode"
- **Changes:** add a `MaintenanceState` implementing `ElevatorState` (no legal outgoing/incoming transitions except an explicit `IDLE ↔ MAINTENANCE` toggle triggered by an operator action, not a rider request); `SchedulingStrategy` implementations already filter on `state.name() !== 'MAINTENANCE'` in the sketch above — one more branch, not a rewrite.
- **Doesn't change:** how a normal elevator moves, how doors work, how requests are modeled. A maintenance car simply never enters the candidate pool, so nothing downstream needs to know it exists.

**Why both are cheap:** the design put *variation points* (which elevators are eligible, how an elevator behaves) behind interfaces (`SchedulingStrategy`, `ElevatorState`) instead of scattering `if (isExpress)` / `if (isUnderMaintenance)` checks across `ElevatorController`. That's the whole bet Section 4's patterns were making.

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "How do you decide which elevator answers a call, with N elevators running?"
> *"I put the decision behind a Strategy interface so it's swappable. A simple baseline picks the nearest idle-or-compatible car by floor distance. A better one — closer to how real elevators work — prefers a car that's already moving toward the call in the same direction, since it can pick it up almost for free; that's the SCAN/LOOK algorithm. Either way the controller just calls `strategy.selectElevator(...)`, so changing the algorithm never touches the controller."*

### Q: "Why State pattern instead of an `if/else` on a status field?"
> *"Because the number of branches grows with every new status, and every method that checks status has to be revisited each time. With State, each status is its own class behind a common interface, and transitions are explicit — I keep a legal-transitions table so `transition()` throws instead of silently allowing something like moving up directly into moving down. Adding maintenance mode later is a new class, not a new `if` sprinkled through five methods."*

### Q: "How do you avoid an elevator being double- or conflictingly-assigned when two hall calls land at nearly the same time?"
> *"The risk is a stale read: two requests each evaluate 'which car is best' before either one commits, and both land on the same elevator with conflicting direction needs. I treat 'pick a candidate' and 'commit the assignment' as one critical section per elevator — synchronized in Java, or a single-writer queue/actor per car. It's tempting to assume it's fine because the event loop is single-threaded, but that guarantee quietly breaks the moment any async work (like a DB write) gets inserted mid-handler, so I make the lock explicit rather than relying on incidental ordering."*

### Q: "Walk me through SCAN with a few pending requests."
> *"Say the car's at floor 5 going up with a stop queued at 9, plus a down-call at 4 and an up-call at 2 waiting. SCAN keeps it moving up to serve floor 9 first since that's ahead in the current direction, reverses, serves floor 4 on the way down since that's now in-direction, keeps going down to the lowest pending floor, then finally reverses again to pick up floor 2. It never doubles back mid-corridor — direction only flips at a stop — which keeps average wait time down compared to serving requests in arrival order."*

### Q: "How do you handle the weight-limit alarm?"
> *"On door-open I check current load against capacity. If it's over, I sound the alarm and simply don't schedule the auto-close timer — the doors stay open until load drops back under the limit. It's a small guard inside `openDoors()`, not a new state, since the elevator is still legitimately 'doors open,' just blocked from proceeding."*

### Q: "Now add an express elevator / a maintenance mode — what changes?"
> *"For express, I add a `servesFloor()` check that the strategy filters candidates on before scoring — the controller and state machine are untouched. For maintenance, it's a new `MaintenanceState` plus one more filter condition in the strategy so those cars drop out of the candidate pool. Both are additive because the variation points — which cars are eligible, how a car behaves — were already behind interfaces (Strategy, State) rather than baked into the controller as conditionals."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Shape:** multi-elevator dispatch scheduling under concurrent requests, not physics simulation.
- **Entities:** `Building` 1–N `Elevator`/`Floor`; `ElevatorController` 1–N `Elevator` + `SchedulingStrategy`; `Request` = external `{floor, direction}` or internal `{elevatorId, floor}`.
- **State pattern:** Idle / MovingUp / MovingDown / DoorOpen, legal-transitions table enforced in `transition()`; can't reverse direction without passing through DoorOpen.
- **Strategy pattern:** `SchedulingStrategy` — `NearestElevatorStrategy` (baseline) vs `ScanStrategy`/LOOK (prefer a car already sweeping toward the call).
- **Observer pattern:** elevator pushes floor/state changes to subscribed `Display`s — no polling.
- **Concurrency:** treat "pick candidate + commit assignment" as one critical section per elevator (lock/mutex/actor); don't rely on incidental single-threadedness once async work is involved.
- **SCAN example:** at floor 5 going up with stops at {9 up, 4 down, 2 up} → serves **9 → 4 → 2** (finish current direction, reverse only at the end, opposite-direction calls wait for the return sweep).
- **Weight alarm:** guard inside `openDoors()` — buzzer + skip the auto-close timer, no new state needed.
- **Extensibility:** express elevators = filter on `servesFloor()`; maintenance mode = new `MaintenanceState` + filter — both additive because eligibility and behavior sit behind interfaces, not `if/else` in the controller.

*— LLD Problem 02 complete —*
