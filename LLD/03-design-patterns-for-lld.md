# LLD Study Notes — Part 03 — Design Patterns for LLD

> **This file continues [`System-design/22-design-patterns.md`](../System-design/22-design-patterns.md).** That file already covers **Singleton, Factory, Builder, Strategy, Observer, Dependency Injection, Repository** in full Q&A depth — they are **not** re-taught here, only referenced by name where relevant. This file adds the patterns that show up constantly in **LLD machine-coding interviews** (Parking Lot, Elevator, BookMyShow, Cab Booking, etc.) but aren't in that file yet: **State, Decorator, Adapter, Facade, Command, Chain of Responsibility, Composite, Template Method, Iterator, Proxy**.

> **Format:** same as the reference file — **Q&A** style, my prompts are the questions, explanations are the answers. Interview-level: what · where useful · analogy · trade-offs · code · Q&A. Each pattern also names **one real LLD problem from this repo's list** that uses it naturally — that's the answer to "why this pattern, not a textbook toy example."

---

## Table of Contents

1. [Quick map (2 more categories)](#map)
2. [Structural: Decorator, Adapter, Facade, Composite, Proxy](#structural)
3. [Behavioral: State, Command, Chain of Responsibility, Template Method, Iterator](#behavioral)
4. [Code examples (all 10)](#code)
5. [How they combine](#combine)
6. [Interview Q&A](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="map"></a>
# 1. Quick map (patterns fall into 2 more buckets)

The reference file already covered Creational (Singleton, Factory, Builder) and part of Behavioral/Architectural. This file fills out the other classic **GoF buckets**:

- **Structural** (how objects are composed into larger structures): Decorator, Adapter, Facade, Composite, Proxy
- **Behavioral** (how objects interact — extended from Part 22's Strategy/Observer): State, Command, Chain of Responsibility, Template Method, Iterator

> **Interview framing:** structural patterns answer *"how do these pieces fit together without a mess of glue code"*; behavioral patterns (beyond Strategy/Observer) answer *"how does control flow and responsibility move between objects"*. Almost every LLD problem in this repo's list uses at least 2–3 patterns from across **both** files at once — see [§5 How they combine](#combine).

---

<a name="structural"></a>
# 2. Structural

## Decorator — wrap behavior, don't rewrite the class

- **What:** attach new behavior to an object **dynamically**, by wrapping it in another object with the **same interface** — instead of subclassing for every combination.
- **Where:** stacking optional add-ons — **pizza toppings**, **coffee add-ons**, **notification enrichment** (add retry, add rate-limiting, add logging before delivery), UI component wrapping (scrollable, bordered).
- **Analogy:** dressing in **layers** — base t-shirt, then a jacket, then a raincoat. Each layer adds warmth/protection without changing what's underneath, and you can stack them in any order.
- **Trade-offs:** ✅ avoids a combinatorial explosion of subclasses (`RetryableLoggedRateLimitedNotifier` doesn't need to exist as one class) · behavior composes at runtime · ❌ many small wrapper objects, and stack-trace/debugging gets noisier (which layer failed?).
- **LLD problem it answers "why this pattern" for:** **Notification System** (Part 15) — a base `EmailNotifier` gets wrapped with `RetryDecorator`, then `RateLimitDecorator`, then `LoggingDecorator`, all implementing the same `send()` interface. Adding a new enrichment (e.g. dedup) never touches the base sender — this is the concrete answer to "add a channel/feature without modifying dispatch logic" (Open/Closed).

## Adapter — make incompatible interfaces work together

- **What:** a **wrapper** that translates one interface into another the client already expects, so two pieces of code that weren't designed to work together, can.
- **Where:** integrating **third-party / legacy APIs** — a legacy payment gateway with `makePayment(amountInCents, cardToken)` wrapped to match your app's `PaymentProcessor.pay(order)` interface; wrapping an external maps SDK to match your internal `LocationProvider` interface.
- **Analogy:** a **power plug adapter** — the socket (interface) and the plug (your code) are incompatible shapes; the adapter sits between them so neither has to change.
- **Trade-offs:** ✅ integrates external/legacy code without touching either side · isolates third-party API churn behind one wrapper · ❌ extra indirection layer; if overused, an "adapter of adapters" gets confusing.
- **LLD problem it answers "why this pattern" for:** **Cab Booking / Uber LLD** (Part 13) — the trip flow depends on a maps/geolocation SDK and a payment gateway, both third-party with their own interfaces. `PaymentGatewayAdapter` implements the app's internal `PaymentProcessor` interface but internally calls the legacy gateway's `charge(cents, token)` method — so `TripService` never knows it's talking to a legacy API, and swapping gateways later touches one class.

## Facade — one simple interface over a complex subsystem

- **What:** a **single, simplified interface** in front of a set of complex subsystems, so callers don't need to know how the pieces fit together or call them in the right order.
- **Where:** any workflow that touches **multiple subsystems** in sequence — checkout flows (inventory + payment + shipping), a "start car" button that hides fuel injection/ignition/starter motor.
- **Analogy:** a **restaurant waiter** — you say "I'll have the steak"; the waiter coordinates the kitchen, the grill station, and the expo line. You never talk to the subsystems directly.
- **Trade-offs:** ✅ simple entry point for callers, hides subsystem complexity/ordering · reduces coupling between client code and multiple subsystems · ❌ can become a **God object** if it starts containing logic instead of just delegating; doesn't prevent callers from bypassing it and reaching subsystems directly if they want to.
- **LLD problem it answers "why this pattern" for:** **BookMyShow / Movie Ticket Booking** (Part 12) — booking a seat means: lock the seat, run payment, confirm the booking, fire a notification, release the lock on failure. A `BookingFacade.bookSeat(showId, seatId, user, paymentInfo)` method hides `SeatInventory`, `PaymentService`, `BookingRepository`, and `NotificationService` behind one call — the controller/API layer calls one method instead of orchestrating four subsystems itself.

## Composite — treat a tree of objects uniformly

- **What:** compose objects into **tree structures** (part-whole hierarchies) so that individual objects (leaves) and groups of objects (composites) are treated through the **same interface** — a call like `getCount()` works whether it's on a leaf or a branch.
- **Where:** **file systems** (file vs folder, both "have a size"), **UI component trees** (a button vs a panel full of buttons, both "can render"), org charts.
- **Analogy:** a **folder in a file explorer** — `getSize()` on a single file just returns its size; `getSize()` on a folder recursively sums its children. Same method name, same caller code, either way.
- **Trade-offs:** ✅ client code doesn't need to distinguish "is this one thing or a group of things" · recursive operations (sum, count, render) come for free · ❌ can make the design **too general** — a "leaf" is forced to implement composite-only methods (like `add(child)`) that don't make sense for it, unless carefully split with interfaces.
- **LLD problem it answers "why this pattern" for:** **Parking Lot** (Part 05) — `ParkingLot` contains `Floor`s, each `Floor` contains `Spot`s. A method like `getAvailableSpotCount()` can be called on the whole lot, a single floor, or (recursively) computed bottom-up from spots — the caller doesn't special-case "am I asking a lot or a floor," it's the same interface at every level of the hierarchy.

## Proxy — a stand-in that controls access to the real object

- **What:** an object that **looks like** the real object (same interface) but sits in front of it to control access — for **lazy loading** (create the real thing only when needed), **access control** (check permissions first), or **caching** (serve from cache, skip the real call).
- **Where:** **rate limiting a service call**, lazy-loading a heavy resource (large image, DB connection), caching expensive reads, permission checks before hitting the real object.
- **Analogy:** a **building receptionist** — visitors don't walk straight into the CEO's office; the receptionist (proxy) checks who they are and whether they're allowed in first, and only then lets the real meeting happen.
- **Trade-offs:** ✅ adds a control point (security, caching, throttling) without changing the real object or the caller · transparent to the client (same interface) · ❌ adds a layer of indirection; if the proxy does too much it starts duplicating the real object's responsibilities.
- **LLD problem it answers "why this pattern" for:** **Rate Limiter** (Part 08) — a `RateLimiterProxy` implements the same interface as the real service (`handleRequest(userId)`), but before delegating to the real service it checks the limiting Strategy (fixed window / sliding window / token bucket, from Part 22's Strategy pattern) and either forwards the call or rejects it. The real service never has rate-limiting logic in it — the Proxy is the access-control gate in front of it.

---

<a name="behavioral"></a>
# 3. Behavioral (extends Part 22's Strategy/Observer)

## State — object changes behavior as its internal state changes

- **What:** an object's behavior changes based on its **internal state**, and each state is modeled as its **own class** implementing a common interface — instead of one giant `if/else`/`switch` checking `this.state` everywhere a method is called.
- **Where:** **vending machine** (Idle → HasMoney → Dispensing → OutOfStock), **elevator** (Idle/MovingUp/MovingDown/DoorOpen), **order status** (Placed → Shipped → Delivered → Cancelled), **traffic light**.
- **Analogy:** a **traffic light** — red, yellow, green each *know* what comes next and what's legal to do in that state. You don't ask an external rulebook "what should happen if it's currently red and someone presses the pedestrian button" — the `RedState` object itself knows.
- **Trade-offs:** ✅ adding a new state means adding a new class, not touching every existing `if/else` branch (Open/Closed) · each state's legal transitions are localized and easy to reason about · ❌ more classes for what could look like "just a few ifs" in a toy example; can be overkill for 2-state objects.
- **Why State beats the if/else version:** in the if/else version, every method (`insertCoin()`, `selectItem()`, `dispense()`) has a branch for every state — add one new state (say, `Maintenance`) and you must revisit **every** method and add a branch to each, easy to miss one. In the State-pattern version, you add one new `MaintenanceState` class implementing the same interface — existing states and existing methods are untouched.
- **LLD problem it answers "why this pattern" for:** **Vending Machine** (Part 09) — this is the textbook State-pattern problem in this repo's list: `IdleState`, `HasMoneyState`, `DispensingState`, `OutOfStockState` each implement `insertCoin()`, `selectItem()`, `dispense()`, and calling an illegal action for the current state (e.g. `dispense()` while `Idle`) is simply a no-op/error in that state's class, not a bug hiding in a missed `if` branch.

## Command — encapsulate a request as an object

- **What:** turn a **request/action itself** into an object (with an `execute()` method, and often an `undo()`), instead of directly calling a method — so requests can be **queued, logged, undone, or passed around** like any other value.
- **Where:** **undo/redo** (text editors, drawing apps), **queued/scheduled actions** (task queues, job schedulers), a **remote control** (each button = a Command object bound to a receiver), transactional operations that need rollback.
- **Analogy:** a **restaurant order slip** — the waiter doesn't cook; they write the order (encapsulated request) and hand it to the kitchen. The slip can be queued behind other orders, and if the customer changes their mind before it's cooked, the slip can be pulled back (undo).
- **Trade-offs:** ✅ decouples the invoker (who triggers the action) from the receiver (who performs it) · natural fit for undo/redo, since each command knows how to reverse itself · enables queuing/logging/retrying actions uniformly · ❌ one class per action can be a lot of boilerplate for simple apps.
- **LLD problem it answers "why this pattern" for:** **Chess** (Part 10) — each move is a `MoveCommand` object (`{ piece, from, to, capturedPiece }`) with an `execute()` that updates the board and an `undo()` that restores it, including any captured piece. The game's move history is just a stack/list of `MoveCommand` objects — undo/redo (and even "show move history" or replay) fall out for free, instead of trying to reverse-engineer a board diff after the fact.

## Chain of Responsibility — pass a request along a chain of handlers

- **What:** a request travels along a **chain of handler objects**; each handler either processes the request or passes it to the **next handler** in the chain — the sender doesn't know (or care) which handler will actually deal with it.
- **Where:** **logging frameworks** (DEBUG → INFO → WARN → ERROR handlers, each deciding "do I handle this level, or pass it on"), **middleware chains** (auth → validation → rate-limit → business logic in a web framework), approval workflows (manager → director → VP, each escalating if they can't approve).
- **Analogy:** **tech support tiers** — Tier 1 tries to fix your issue; if they can't, they escalate to Tier 2, then Tier 3. You call one number; the chain internally figures out who actually handles it.
- **Trade-offs:** ✅ sender is decoupled from which handler processes the request · add/remove/reorder handlers without touching existing ones (Open/Closed) · ❌ if no handler in the chain handles the request, it can silently fall through unless there's a default; debugging "which handler ran" can require tracing the whole chain.
- **LLD problem it answers "why this pattern" for:** **Logging Framework** (Part 14) — `DebugHandler → InfoHandler → WarnHandler → ErrorHandler`, each holding a `nextHandler` reference. A log call enters at `DebugHandler`; each handler checks "is my level enabled and does it match," writes/forwards accordingly. Adding a new level (e.g. `TRACE`) or a new sink (e.g. a `RemoteHandler` that also forwards to a monitoring service) means adding one new handler and re-linking the chain — no existing handler's code changes.

## Template Method — algorithm skeleton, overridable steps

- **What:** define the **overall skeleton of an algorithm** in a base class/method, with some steps implemented and some left as **hooks** for subclasses to override — the *order* of steps is fixed, but individual steps vary.
- **Where:** a **data-import pipeline** (`read → validate → transform → save`, where `read` differs for CSV vs JSON but the pipeline order never changes), report generation, any "same shape, different details" workflow.
- **Analogy:** a **recipe card with blanks** — "1. Preheat oven. 2. Prepare [FILLING]. 3. Bake for [TIME]. 4. Cool and serve." The steps and their order are fixed; only the bracketed parts change per recipe (subclass).
- **Trade-offs:** ✅ shared algorithm structure lives in one place (no copy-pasted pipeline logic per variant) · enforces the correct step *order* automatically, subclasses can't reorder or skip a step by mistake · ❌ inheritance-based (harder to change at runtime than Strategy, which is composition-based) — if you need to swap the *whole* algorithm dynamically, Strategy fits better than Template Method.
- **LLD problem it answers "why this pattern" for:** **Snake & Ladder** (Part 16) — `Game.playTurn()` is the template: `rollDice() → movePlayer() → checkSnakeOrLadder() → checkWinner() → nextPlayer()`. The base class fixes that order (you can't check the winner before moving). A variant like a "double dice" house rule overrides just `rollDice()`; the rest of the pipeline is untouched — this is the pattern's whole point: fix the skeleton, vary the steps.

## Iterator — traverse a collection without exposing its internals

- **What:** provide a **uniform way to step through elements** of a collection (`hasNext()` / `next()`) without exposing whether it's backed by an array, linked list, tree, etc.
- **Where:** any **custom data structure** that needs traversal — a linked list, a tree, a paginated API result set — where you don't want callers reaching into internal pointers/nodes directly.
- **Analogy:** a **museum guided tour** — you experience the exhibits one at a time, in order, without needing to know the building's floor plan or which hallway connects to which room. The guide (iterator) handles that.
- **Trade-offs:** ✅ callers traverse without knowing the internal structure (array vs linked list vs tree) — internals can change without breaking callers · supports multiple independent traversals of the same collection at once · ❌ another small object/class for what a plain `for` loop over an array could do trivially — only worth it when the internal structure is non-trivial.
- **LLD problem it answers "why this pattern" for:** **LRU Cache** (Part 07) — the cache is backed by a **doubly linked list** (MRU at head, LRU at tail — see `work/LRUCache_DLL.js`) plus a hashmap. A `CacheIterator` exposes `hasNext()`/`next()` walking the DLL from MRU to LRU, so code that wants "list all keys by recency" (e.g. for debugging or metrics) never touches `.next`/`.prev` pointers directly — if the internal structure changed later (say, to a skip list), the iterator's callers wouldn't need to change.

---

<a name="code"></a>
# 4. Code examples (all 10)

## Decorator
```js
class EmailNotifier {                              // base component
  send(message) { console.log(`Email: ${message}`); return true; }
}
class NotifierDecorator {                           // same interface as the component
  constructor(wrapped) { this.wrapped = wrapped; }
  send(message) { return this.wrapped.send(message); }
}
class RetryDecorator extends NotifierDecorator {
  send(message) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (this.wrapped.send(message)) return true;   // stop on first success
    }
    return false;
  }
}
class RateLimitDecorator extends NotifierDecorator {
  constructor(wrapped, maxPerMinute) { super(wrapped); this.count = 0; this.max = maxPerMinute; }
  send(message) {
    if (this.count >= this.max) { console.log("Rate limited, dropped"); return false; }
    this.count++;
    return this.wrapped.send(message);
  }
}
let notifier = new EmailNotifier();
notifier = new RetryDecorator(notifier);
notifier = new RateLimitDecorator(notifier, 5);       // stack layers, any order
notifier.send("Your order shipped!");
// base EmailNotifier never changed to gain retry + rate-limiting
```

## Adapter
```js
// legacy/third-party gateway — interface we don't control
class LegacyPaymentGateway {
  makePayment(amountInCents, cardToken) { return `Legacy charged ${amountInCents} cents`; }
}
// interface OUR app expects everywhere
class PaymentProcessor {
  pay(order) { throw new Error("not implemented"); }
}
class PaymentGatewayAdapter extends PaymentProcessor {   // translates one shape into the other
  constructor(legacyGateway) { super(); this.legacy = legacyGateway; }
  pay(order) {
    const cents = Math.round(order.amount * 100);
    return this.legacy.makePayment(cents, order.cardToken);   // adapts call shape
  }
}
const processor = new PaymentGatewayAdapter(new LegacyPaymentGateway());
console.log(processor.pay({ amount: 19.99, cardToken: "tok_abc" }));
// TripService only ever calls processor.pay(order) — never knows Legacy* exists
```

## Facade
```js
class SeatInventory { lock(seatId) { console.log(`Locked seat ${seatId}`); return true; } }
class PaymentService { charge(user, amount) { console.log(`Charged ${user} $${amount}`); return true; } }
class BookingRepository { save(booking) { console.log("Booking saved", booking); } }
class NotificationService { send(user, msg) { console.log(`Notify ${user}: ${msg}`); } }

class BookingFacade {                       // ONE simple interface over 4 subsystems
  constructor() {
    this.inventory = new SeatInventory();
    this.payments = new PaymentService();
    this.bookings = new BookingRepository();
    this.notifications = new NotificationService();
  }
  bookSeat(showId, seatId, user, amount) {
    if (!this.inventory.lock(seatId)) return false;
    if (!this.payments.charge(user, amount)) return false;   // in real code: release lock on failure
    const booking = { showId, seatId, user };
    this.bookings.save(booking);
    this.notifications.send(user, "Booking confirmed!");
    return booking;
  }
}
new BookingFacade().bookSeat("show1", "A12", "alice@x.com", 12.5);
// caller never touches SeatInventory/PaymentService/BookingRepository/NotificationService directly
```

## Composite
```js
class Spot {                                  // LEAF
  constructor(id, occupied = false) { this.id = id; this.occupied = occupied; }
  getAvailableCount() { return this.occupied ? 0 : 1; }
}
class Floor {                                 // COMPOSITE — same interface as Spot
  constructor(id) { this.id = id; this.spots = []; }
  addSpot(spot) { this.spots.push(spot); }
  getAvailableCount() {
    return this.spots.reduce((sum, s) => sum + s.getAvailableCount(), 0);   // recurse into children
  }
}
class ParkingLot {                            // COMPOSITE of composites — still same interface
  constructor() { this.floors = []; }
  addFloor(floor) { this.floors.push(floor); }
  getAvailableCount() {
    return this.floors.reduce((sum, f) => sum + f.getAvailableCount(), 0);
  }
}
const floor1 = new Floor(1);
floor1.addSpot(new Spot("1A", false));
floor1.addSpot(new Spot("1B", true));
const lot = new ParkingLot();
lot.addFloor(floor1);
console.log(lot.getAvailableCount());   // 1 — same getAvailableCount() call at every level
```

## Proxy
```js
class RealParkingService {                    // the REAL object — no rate-limiting logic in it
  handleRequest(userId) { return `Processed request for ${userId}`; }
}
class RateLimiterProxy {                       // SAME interface, sits in front
  constructor(realService, maxPerMinute) {
    this.realService = realService;
    this.max = maxPerMinute;
    this.counts = new Map();                    // userId -> count (simplified, no window reset shown)
  }
  handleRequest(userId) {
    const count = this.counts.get(userId) || 0;
    if (count >= this.max) return `429: ${userId} rate limited`;   // gate BEFORE the real call
    this.counts.set(userId, count + 1);
    return this.realService.handleRequest(userId);                 // delegate
  }
}
const service = new RateLimiterProxy(new RealParkingService(), 2);
console.log(service.handleRequest("alice"));   // Processed...
console.log(service.handleRequest("alice"));   // Processed...
console.log(service.handleRequest("alice"));   // 429: rate limited
```

## State
```js
class VendingState {                          // common interface for all states
  insertCoin(machine) { console.log("Can't insert coin now"); }
  selectItem(machine) { console.log("Can't select now"); }
  dispense(machine)   { console.log("Can't dispense now"); }
}
class IdleState extends VendingState {
  insertCoin(machine) { console.log("Coin accepted"); machine.setState(machine.hasMoneyState); }
}
class HasMoneyState extends VendingState {
  selectItem(machine) { console.log("Item selected"); machine.setState(machine.dispensingState); }
}
class DispensingState extends VendingState {
  dispense(machine) { console.log("Dispensing item"); machine.setState(machine.idleState); }
}
class VendingMachine {
  constructor() {
    this.idleState = new IdleState();
    this.hasMoneyState = new HasMoneyState();
    this.dispensingState = new DispensingState();
    this.state = this.idleState;                 // starts Idle
  }
  setState(state) { this.state = state; }
  insertCoin() { this.state.insertCoin(this); }
  selectItem() { this.state.selectItem(this); }
  dispense()   { this.state.dispense(this); }
}
const vm = new VendingMachine();
vm.insertCoin();   // Coin accepted -> HasMoney
vm.selectItem();   // Item selected -> Dispensing
vm.dispense();     // Dispensing item -> Idle
// adding a new "Maintenance" state = one new class, zero edits to the above
```

## Command
```js
class MoveCommand {                            // the REQUEST, as an object
  constructor(board, piece, from, to) {
    this.board = board; this.piece = piece; this.from = from; this.to = to;
    this.capturedPiece = null;
  }
  execute() {
    this.capturedPiece = this.board.get(this.to);   // remember what execute() overwrote
    this.board.set(this.to, this.piece);
    this.board.set(this.from, null);
  }
  undo() {                                       // command knows how to reverse itself
    this.board.set(this.from, this.piece);
    this.board.set(this.to, this.capturedPiece);
  }
}
class Game {
  constructor(board) { this.board = board; this.history = []; }
  playMove(piece, from, to) {
    const cmd = new MoveCommand(this.board, piece, from, to);
    cmd.execute();
    this.history.push(cmd);                      // queued for undo/redo/replay
  }
  undoLastMove() { const cmd = this.history.pop(); if (cmd) cmd.undo(); }
}
const board = new Map();
const game = new Game(board);
game.playMove("knight", "b1", "c3");
game.undoLastMove();   // reverses exactly the last command, including any capture
```

## Chain of Responsibility
```js
const LEVELS = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };
class LogHandler {
  constructor(level) { this.level = level; this.next = null; }
  setNext(handler) { this.next = handler; return handler; }    // chain wiring, returns next for fluent setup
  log(messageLevel, message) {
    if (LEVELS[messageLevel] >= LEVELS[this.level]) {
      this.write(messageLevel, message);
    }
    if (this.next) this.next.log(messageLevel, message);        // pass along regardless
  }
  write(level, message) { console.log(`[${level}] ${message}`); }
}
class ConsoleHandler extends LogHandler {}
class FileHandler extends LogHandler {
  write(level, message) { console.log(`FILE-WRITE [${level}] ${message}`); }
}
const console1 = new ConsoleHandler("DEBUG");
const file1 = new FileHandler("WARN");           // only writes WARN+ to file
console1.setNext(file1);
console1.log("INFO", "user logged in");          // console prints it, file skips (below WARN)
console1.log("ERROR", "payment failed");         // both print — chain decides independently
```

## Template Method
```js
class SnakeLadderGame {                          // base class fixes the SKELETON
  playTurn(player) {
    const roll = this.rollDice();                 // step 1 — overridable
    this.movePlayer(player, roll);                 // step 2 — fixed
    this.checkSnakeOrLadder(player);                // step 3 — fixed
    return this.checkWinner(player);                 // step 4 — overridable
  }
  rollDice() { return Math.floor(Math.random() * 6) + 1; }   // default: single die
  movePlayer(player, roll) { player.position += roll; console.log(`${player.name} -> ${player.position}`); }
  checkSnakeOrLadder(player) { /* look up jump table, adjust player.position */ }
  checkWinner(player) { return player.position >= 100; }
}
class DoubleDiceGame extends SnakeLadderGame {   // overrides ONE step, order untouched
  rollDice() { return this.superRoll() + this.superRoll(); }
  superRoll() { return Math.floor(Math.random() * 6) + 1; }
}
const game = new DoubleDiceGame();
game.playTurn({ name: "Alice", position: 0 });
// playTurn()'s step ORDER can never be broken by a subclass — only individual steps vary
```

## Iterator
```js
class Node { constructor(key, val) { this.key = key; this.val = val; this.prev = null; this.next = null; } }

class LRUCacheIterator {                          // uniform traversal, hides the DLL internals
  constructor(headNode) { this.current = headNode; }   // headNode = MRU end
  hasNext() { return this.current !== null; }
  next() {
    const { key, val } = this.current;
    this.current = this.current.next;                    // MRU -> ... -> LRU
    return { key, val };
  }
}
// usage: caller never touches .prev/.next directly
const a = new Node("a", 1), b = new Node("b", 2);
a.next = b; b.prev = a;
const it = new LRUCacheIterator(a);
while (it.hasNext()) { console.log(it.next()); }   // {key:"a",val:1} then {key:"b",val:2}
// if the cache's internals later became a skip list, callers of the iterator wouldn't change
```

---

<a name="combine"></a>
# 5. How they combine (the realistic picture)

Just like Part 22's closing example, real LLD answers stack patterns from **both files** together. This is the part interviewers are actually listening for — not "I know pattern X," but "I chose X here because Y, and it combines with Z naturally":

- **Elevator System** = **State** (idle / moving-up / moving-down / door-open, this file) + **Strategy** (SCAN/look-elevator scheduling algorithm decides which floor to serve next, Part 22) — the elevator's *mode* is State, the elevator's *scheduling decision* is Strategy, and they don't overlap.
- **Rate Limiter** = **Strategy** (fixed window / sliding window / token bucket as swappable algorithms, Part 22) wrapped by a **Proxy** (this file) that gates calls to the real service before the Strategy even runs.
- **BookMyShow** = **Facade** (`BookingFacade` hides seat lock + payment + save + notify, this file) + **Observer** (booking confirmation fans out to notification subscribers, Part 22) + implicitly **State** on the seat itself (Available → Locked → Booked).
- **Logging Framework** = **Chain of Responsibility** (level filtering, this file) + **Strategy** (pluggable output sinks — console/file/remote, Part 22) + **Singleton** (one logger instance app-wide, Part 22 — one of the *legitimate* Singleton uses) + **Builder** (constructing a structured log message, Part 22).
- **Notification System** = **Decorator** (retry/rate-limit/logging wrapped around the sender, this file) + **Factory** (picks email vs SMS vs push channel, Part 22) + **Observer** (users subscribe to notification types, Part 22).
- **Cab Booking / Uber** = **Adapter** (wrapping the legacy payment gateway / third-party maps SDK, this file) + **State** (trip lifecycle: requested → accepted → ongoing → completed/cancelled) + **Strategy** (nearest-driver matching algorithm, Part 22) + **Observer** (real-time status pushed to rider/driver, Part 22).
- **Parking Lot** = **Composite** (`ParkingLot` → `Floor` → `Spot` tree, this file) + **Strategy** (hourly vs flat vs premium pricing, Part 22) + **Factory** (spot/vehicle type creation, Part 22).
- **Chess** = **Command** (each move as an undoable object, this file) + **Strategy** (move validation / win-condition checking per piece type, Part 22) + composition over inheritance for the piece hierarchy (a design principle, not a pattern — see Part 01 SOLID / Part 00 OOP).
- **Splitwise** = **Strategy** (equal/exact/percentage split types, Part 22) + **Observer** (balance changes notify group members, Part 22) — no new pattern from this file needed; it's a good example that not every problem needs the *newer* patterns.

> **Interview insight:** if you can only name one pattern for a system, you're underselling the design. The strongest LLD answers name 2–4 patterns per problem, each solving a **different** sub-problem (structure vs behavior-switching vs algorithm-swapping vs notification) — and can say in one sentence why that pattern and not a neighboring one (see [Key distinctions](#keydist) below).

<a name="keydist"></a>
### Key distinctions (the ones interviewers probe)

- **State vs Strategy:** both swap behavior via composition, but State changes **automatically as an object's internal condition changes** (and states usually know about/trigger transitions to each other); Strategy is chosen **once by the client** and doesn't change itself mid-flight. A vending machine moves itself from `HasMoney` to `Dispensing`; nobody outside picks a new state for it. A caller, by contrast, explicitly picks `strategies.fastest` for a Navigator.
- **Decorator vs Proxy:** structurally near-identical (both wrap an object behind the same interface) but different **intent**: Decorator **adds behavior** (stacking, order matters, multiple layers expected); Proxy **controls access** to the real object (usually one layer, may not even call the real object at all — e.g. reject on a rate limit).
- **Facade vs Adapter:** both are "one interface in front of something else," but Facade **simplifies** an interface you'd otherwise have to call in the right order yourself (subsystems you may control); Adapter **translates** one interface into another one the client already expects (usually a single third-party/legacy interface you don't control).
- **Command vs Strategy:** both wrap "a thing to do" as an object, but Command represents a **discrete request/action** (with metadata like when to undo it, and it can be queued/logged); Strategy represents an **interchangeable algorithm** for a recurring operation (no notion of undo or queuing).
- **Chain of Responsibility vs Decorator:** both link objects in a sequence, but in Chain of Responsibility only **one handler** (or a subset) actually processes the request and the rest just pass it along — the chain is about "who handles this"; Decorator's whole point is that **every layer** contributes to the final behavior — it's about "what gets added."
- **Composite vs Iterator:** often used together but solve different problems — Composite is about **treating a tree of objects uniformly** (structure); Iterator is about **traversing** a collection (behavior) without exposing how it's structured internally. A Composite tree is frequently what an Iterator walks over.

---

<a name="interview"></a>
# 6. Interview Q&A

### Q: "When would you reach for State instead of just a switch statement?"
> *"When an object's behavior needs to change based on its own condition, and that condition has enough states/transitions that a switch would need to live inside every single method. In a vending machine, insertCoin, selectItem, and dispense would each need a switch over 4+ states — miss updating one switch when you add a Maintenance state and you've got a bug. With State, each state is its own class implementing the same interface, so adding Maintenance means adding one class, not touching four existing methods."*

### Q: "What's the difference between Decorator and just subclassing?"
> *"Subclassing for every combination of add-ons explodes — retry, rate-limited, logged, and all combinations, would need a separate subclass each. Decorator wraps the base object at runtime with the same interface, so I can stack RetryDecorator, then RateLimitDecorator, then LoggingDecorator in any order, on any base sender, without a new class per combination. It trades subclass explosion for a small number of reusable wrapper classes."*

### Q: "Why wrap a legacy API in an Adapter instead of just calling it directly?"
> *"So the rest of my app depends on an interface I control, not the legacy API's shape. If the legacy payment gateway takes amountInCents and a raw card token, but my app's PaymentProcessor interface expects pay(order), the Adapter is the one place that does that translation. If I ever swap gateways, I write one new Adapter — TripService or OrderService never changes."*

### Q: "How is Facade different from just having a well-organized service layer?"
> *"It basically is that, formalized — a Facade explicitly hides multiple subsystems behind one method so the caller doesn't need to know the call order or which subsystems exist. In BookMyShow, BookingFacade.bookSeat() hides seat locking, payment, saving the booking, and notifying — the API controller calls one method instead of knowing it has to lock before charging before saving before notifying. The risk is letting the Facade accumulate actual business logic instead of just delegating — then it's a God object, not a Facade."*

### Q: "Composite sounds like just 'has a list of children' — what's the actual pattern?"
> *"The pattern part is that leaves and composites implement the **same interface**. In Parking Lot, Spot, Floor, and ParkingLot all expose getAvailableCount() — calling it on a single spot or the entire lot looks identical to the caller, and a Floor's implementation just recurses into its Spots. Without that shared interface, you'd need separate code paths for 'am I counting a spot or a floor,' which defeats the point."*

### Q: "Why is Proxy useful if it just forwards to the real object?"
> *"Because it doesn't just forward — it decides **whether** to forward, transparently to the caller. In a Rate Limiter, the RateLimiterProxy implements the same interface as the real service, but checks the limiting Strategy first and can reject a request without ever touching the real service. The caller can't tell it's talking to a proxy instead of the real object, which is exactly what lets me add that gate without changing either the caller or the real service."*

### Q: "Why is Command a good fit for undo, instead of just tracking a diff after the fact?"
> *"Because the command already knows how to reverse itself at the moment it executes — in Chess, a MoveCommand captures the piece that got overwritten as part of execute(), so undo() can restore it exactly, no diffing needed. It also means the move history is just a list of Command objects, so replay, undo, and redo all fall out of the same structure instead of needing separate logic."*

### Q: "How does Chain of Responsibility let you add a log level without touching existing code?"
> *"Each handler only knows about its own level and a reference to the next handler — DebugHandler doesn't know ErrorHandler exists, it just calls next.log(). Adding a TRACE level or a new sink like a RemoteHandler means creating one new handler and wiring it into the chain; none of the existing handlers' code changes. That's the direct answer to 'extend logging without touching existing handlers.'"*

### Q: "Template Method vs Strategy — when would you pick Template Method?"
> *"Strategy swaps out the *entire* algorithm as one interchangeable unit, chosen by the caller. Template Method fixes the *order* of steps in a base class and lets subclasses override individual steps — useful when the sequence itself must never be violated, like a Snake & Ladder turn always being roll then move then check-snake-or-ladder then check-winner. If I only needed to swap the whole turn logic wholesale, Strategy would fit; since I need the pipeline shape enforced and only individual steps to vary, Template Method fits better."*

### Q: "What does Iterator buy you over just exposing the array/list?"
> *"It hides the internal data structure from the caller. My LRU cache is backed by a doubly linked list plus a hashmap — if I let callers walk .next/.prev pointers directly to list keys by recency, I've locked myself into that internal representation forever. An iterator with hasNext()/next() gives the same traversal without exposing how it's stored, so I could swap the internal structure later without breaking anything that iterates over the cache."*

### Q: "Adapter vs Facade — I keep mixing these up."
> *"Both put one interface in front of something else, but the intent differs. Adapter translates one interface into another that the client already expects — usually for one external/legacy thing you don't control, like a payment gateway. Facade simplifies a set of subsystems you usually *do* control, hiding the right call order behind one method — like BookingFacade coordinating inventory, payment, and notifications. Adapter is about interface mismatch; Facade is about workflow complexity."*

---

<a name="cheatsheet"></a>
# 7. Cheat Sheet

| Pattern | Category | One-line purpose | LLD problem where it's used |
|---|---|---|---|
| **State** | Behavioral | Object's behavior changes with its internal state | Vending Machine (Idle/HasMoney/Dispensing/OutOfStock) |
| **Decorator** | Structural | Wrap behavior in layers, same interface | Notification System (retry/rate-limit/log enrichment) |
| **Adapter** | Structural | Translate one interface into another | Cab Booking / Uber (legacy payment gateway) |
| **Facade** | Structural | One simple interface over a complex subsystem | BookMyShow (`BookingFacade`) |
| **Command** | Behavioral | Encapsulate a request as an object (undo/redo, queue) | Chess (move history, undo/redo) |
| **Chain of Responsibility** | Behavioral | Pass a request along handlers until one deals with it | Logging Framework (DEBUG→INFO→WARN→ERROR) |
| **Composite** | Structural | Treat a tree of objects (leaf or branch) uniformly | Parking Lot (`ParkingLot`→`Floor`→`Spot`) |
| **Template Method** | Behavioral | Fixed algorithm skeleton, overridable steps | Snake & Ladder (`playTurn` pipeline) |
| **Iterator** | Behavioral | Traverse a collection without exposing internals | LRU Cache (MRU→LRU traversal over the DLL) |
| **Proxy** | Structural | Stand-in controlling access to the real object | Rate Limiter (`RateLimiterProxy` gating calls) |

### One-liner
Structural patterns solve **"how do these pieces fit together"**; the behavioral patterns in this file solve **"how does control/responsibility move between objects"** — together with Part 22's Strategy/Observer/DI/Repository, that's the full pattern vocabulary this repo's LLD problems draw from.

### Connects to
- [`System-design/22-design-patterns.md`](../System-design/22-design-patterns.md) — Singleton, Factory, Builder, Strategy, Observer, DI, Repository (read first).
- [`LLD/00-ROADMAP.md`](00-ROADMAP.md) — Part 04 (the LLD problem-solving framework) is next; Phase 3 (Parking Lot, Elevator, LRU Cache, …) is where every pattern named above gets applied for real, inside a full class design.
- [`work/LRUCache_DLL.js`](../work/LRUCache_DLL.js) — the DLL this file's Iterator example walks over; still the open hands-on target for Part 07.

### Suggested next
- **Part 04 — The LLD problem-solving framework** (write it out fully before touching a Phase 3 problem).
- **Part 05 — Parking Lot** (Composite + Strategy + Factory, concurrency: two vehicles claiming the same spot).
- **Part 06 — Elevator System** (State + Strategy, concurrency: simultaneous requests from different floors).

*— End of LLD Part 03 —*
