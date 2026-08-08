# LLD Study Notes — Part 01 — SOLID Principles

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Each principle: definition, a BAD code example that violates it, the REFACTORED fix, and where it shows up in this repo's LLD problems.
>
> **Continues from:** [`00-oop-recap.md`](00-oop-recap.md) — SOLID is five named, battle-tested applications of encapsulation/composition/polymorphism/abstraction. **Continues to:** Part 03 (design patterns) and every problem in Phase 3 of [`00-ROADMAP.md`](00-ROADMAP.md), which all get scrutinized on "does this violate a SOLID principle."

---

## Table of Contents

1. [Why SOLID, and the running example](#why)
2. [S — Single Responsibility Principle](#srp)
3. [O — Open/Closed Principle](#ocp)
4. [L — Liskov Substitution Principle](#lsp)
5. [I — Interface Segregation Principle](#isp)
6. [D — Dependency Inversion Principle](#dip)
7. [Interview questions & answers](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="why"></a>
# 1. Why SOLID, and the running example

**SOLID is five principles for writing classes that survive change** — the interviewer's "now add feature X" without a rewrite. Each letter targets a different way a design goes rigid:

| Letter | Principle | Stops... |
|---|---|---|
| **S** | Single Responsibility | ...one class from doing five jobs |
| **O** | Open/Closed | ...new behavior from requiring edits to existing, tested code |
| **L** | Liskov Substitution | ...a subclass from breaking the contract its parent promised |
| **I** | Interface Segregation | ...classes from being forced to implement methods they don't need |
| **D** | Dependency Inversion | ...high-level logic from being welded to low-level, concrete details |

Every section below reuses one running character to keep it concrete: an **`Order`** class in an e-commerce checkout flow — the exact "God class" flagged in [`00-ROADMAP.md`](00-ROADMAP.md) Part 01 ("an `Order` class that also emails, logs, and calculates tax").

---

<a name="srp"></a>
# 2. S — Single Responsibility Principle (SRP)

**A class should have only one reason to change.** Not "one method" — **one axis of responsibility**. If a change to tax rules, email templates, *and* logging format would all force edits to the same class, that class has three reasons to change, not one.

## ❌ BAD — the God `Order` class
```js
class Order {
  constructor(items) { this.items = items; }

  calculateTotal() {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }

  calculateTax() {                              // reason to change #2: tax law
    return this.calculateTotal() * 0.08;
  }

  sendConfirmationEmail(userEmail) {            // reason to change #3: email provider
    console.log(`Sending email to ${userEmail}: your order total is ${this.calculateTotal()}`);
    // imagine real SMTP/SendGrid code here
  }

  logOrder() {                                  // reason to change #4: logging infra
    console.log(`[LOG] Order placed: ${JSON.stringify(this.items)}`);
  }
}
```
Four unrelated teams could each have a reason to touch `Order`: product (pricing), finance (tax), marketing (email copy), and platform (logging format). One class, four blast radii.

## ✅ REFACTORED — split by responsibility
```js
class Order {
  constructor(items) { this.items = items; }
  calculateTotal() { return this.items.reduce((sum, i) => sum + i.price, 0); }
}

class TaxCalculator {
  calculate(order) { return order.calculateTotal() * 0.08; }
}

class EmailService {
  sendConfirmation(userEmail, order) {
    console.log(`Sending email to ${userEmail}: your order total is ${order.calculateTotal()}`);
  }
}

class OrderLogger {
  log(order) { console.log(`[LOG] Order placed: ${JSON.stringify(order.items)}`); }
}

// Orchestration lives outside all of them — a checkout use-case, not a God class
function checkout(order, userEmail) {
  new OrderLogger().log(order);
  const tax = new TaxCalculator().calculate(order);
  new EmailService().sendConfirmation(userEmail, order);
  return order.calculateTotal() + tax;
}
```
Now `Order` only knows about **items and total**. Tax logic, email, and logging each live where their real reason to change actually originates.

**Where this shows up in this repo's LLD problems:** every entity class in Phase 3 should hold *only* its own state and invariants — e.g. in Part 12 (BookMyShow), `Booking` shouldn't also send notifications; that's why Part 15 (Notification System) exists as a separate, Observer-driven component instead of being bolted onto `Booking`.

---

<a name="ocp"></a>
# 3. O — Open/Closed Principle (OCP)

**Open for extension, closed for modification.** Adding new behavior should mean **adding new code**, not editing an existing, already-tested `if/else` or `switch` chain.

## ❌ BAD — a growing `if/else` for discounts
```js
class DiscountCalculator {
  calculate(order, customerType) {
    if (customerType === "regular") {
      return order.calculateTotal() * 0.95;
    } else if (customerType === "premium") {
      return order.calculateTotal() * 0.85;
    } else if (customerType === "vip") {          // 🔥 every new tier edits this method
      return order.calculateTotal() * 0.70;
    }
    return order.calculateTotal();
  }
}
```
Every new customer tier means opening `DiscountCalculator` again — risking a regression in the tiers that already worked and were already tested.

## ✅ REFACTORED — Strategy pattern, closed to modification
```js
class RegularDiscount { apply(total) { return total * 0.95; } }
class PremiumDiscount { apply(total) { return total * 0.85; } }
class VipDiscount     { apply(total) { return total * 0.70; } }

class DiscountCalculator {
  constructor(strategy) { this.strategy = strategy; }   // injected, swappable
  calculate(order) { return this.strategy.apply(order.calculateTotal()); }
}

// Adding "StudentDiscount" tomorrow = one new class, ZERO edits to DiscountCalculator
class StudentDiscount { apply(total) { return total * 0.90; } }

new DiscountCalculator(new VipDiscount()).calculate(order);
```
This is literally the **Strategy pattern** from `System-design/22-design-patterns.md` — OCP is the *principle*, Strategy is the *pattern* that satisfies it.

**Where this shows up in this repo's LLD problems:** OCP is exactly why **Part 08 — Rate Limiter** must let you swap the limiting algorithm (fixed window / sliding window / token bucket) via Strategy without touching the caller — see `00-ROADMAP.md` Part 08: *"how would you let a caller swap the limiting algorithm without changing calling code (this is the SOLID Open/Closed answer)."* Same story for Part 05 (Parking Lot pricing: hourly/flat/premium) and Part 11 (Splitwise split types: equal/exact/percentage).

---

<a name="lsp"></a>
# 4. L — Liskov Substitution Principle (LSP)

**A subclass must be usable anywhere its parent is expected, without breaking correctness.** If code that works with a `Bird` breaks when handed a `Penguin`, the hierarchy is lying — this is the formal name for the Bird/Penguin problem from [`00-oop-recap.md`](00-oop-recap.md).

## ❌ BAD — a refund-processing hierarchy that lies
```js
class PaymentMethod {
  pay(amount)    { /* charge */ return `Charged $${amount}`; }
  refund(amount) { /* refund */ return `Refunded $${amount}`; }
}

class CreditCard extends PaymentMethod {}   // fine — supports both

class GiftCard extends PaymentMethod {
  refund(amount) {
    throw new Error("Gift cards cannot be refunded");   // 🔥 breaks the contract
  }
}

function processRefund(method, amount) {
  return method.refund(amount);   // works for CreditCard, EXPLODES for GiftCard
}
```
Any code written against `PaymentMethod` — trusting that `refund()` works, because the parent promised it — silently breaks the moment a `GiftCard` is substituted in. That's an LSP violation: the subclass is **not** truly substitutable for the parent.

## ✅ REFACTORED — split the contract to match reality
```js
class PaymentMethod {
  pay(amount) { throw new Error("must implement pay()"); }
}
class Refundable {
  refund(amount) { throw new Error("must implement refund()"); }
}

class CreditCard extends PaymentMethod {
  pay(amount) { return `Charged $${amount}`; }
}
Object.assign(CreditCard.prototype, {
  refund(amount) { return `Refunded $${amount}`; }
});   // CreditCard supports both contracts

class GiftCard extends PaymentMethod {
  pay(amount) { return `Charged $${amount} to gift card`; }
}   // GiftCard simply never claims to be Refundable — no lie, no surprise throw

function processRefund(method, amount) {
  if (!(method.refund)) throw new Error("This payment method doesn't support refunds");
  return method.refund(amount);
}
```
Now the type system (or at minimum, capability checking) reflects reality instead of a subclass silently reneging on a promise the parent made.

**Where this shows up in this repo's LLD problems:** Part 10 (Chess) — a `Piece` hierarchy where every piece "is-a" `Piece` but movement rules differ wildly is the classic LSP trap; that's why the roadmap calls for composition (a `Piece` interface with pluggable movement) over `Pawn extends Piece extends GamePiece`. Also Part 06 (Elevator) — if a `FreightElevator` subclass can't honor the same `requestFloor()` contract as a passenger elevator, the State-pattern dispatch logic built around the base type breaks.

---

<a name="isp"></a>
# 5. I — Interface Segregation Principle (ISP)

**Don't force a class to implement methods it doesn't need.** Prefer several small, focused interfaces over one fat one — a class should only depend on the parts of a contract it actually uses.

## ❌ BAD — one fat `Worker` interface
```js
class Worker {
  work()  { throw new Error("must implement"); }
  eat()   { throw new Error("must implement"); }
  sleep() { throw new Error("must implement"); }
}

class HumanWorker extends Worker {
  work()  { return "coding"; }
  eat()   { return "eating lunch"; }
  sleep() { return "sleeping at night"; }
}

class RobotWorker extends Worker {
  work()  { return "welding"; }
  eat()   { throw new Error("robots don't eat"); }    // 🔥 forced, meaningless method
  sleep() { throw new Error("robots don't sleep"); }  // 🔥 forced, meaningless method
}
```
`RobotWorker` is **forced** to implement `eat()`/`sleep()` just to satisfy the interface shape — every caller that innocently calls `worker.eat()` on any `Worker` risks a runtime explosion for a `RobotWorker`, and the class carries dead, lying methods.

## ✅ REFACTORED — split into focused, composable contracts
```js
class Workable { work() { throw new Error("must implement"); } }
class Eatable  { eat()  { throw new Error("must implement"); } }
class Sleepable{ sleep(){ throw new Error("must implement"); } }

class HumanWorker {
  work()  { return "coding"; }
  eat()   { return "eating lunch"; }
  sleep() { return "sleeping at night"; }
}   // implements all three — it needs all three

class RobotWorker {
  work() { return "welding"; }
}   // only implements what it actually needs — no fake eat()/sleep()
```
`RobotWorker` no longer carries methods it must fake or crash on. Callers that only need `work()` can depend on a narrow `Workable`-shaped contract instead of the entire fat interface.

**Where this shows up in this repo's LLD problems:** Part 14 (Logging Framework) — a `LogHandler` interface should expose only `handle(record)`, not also force every handler to implement unrelated formatting/rotation methods it doesn't need. Same idea in Part 13 (Cab Booking) — a `Driver` shouldn't be forced into a fat interface that also demands rider-only methods just because both extend some shared `Person` base.

---

<a name="dip"></a>
# 6. D — Dependency Inversion Principle (DIP)

**High-level modules shouldn't depend on low-level modules — both should depend on abstractions.** And: **abstractions shouldn't depend on details; details should depend on abstractions.** In practice: depend on an interface/contract, not a concrete class, and inject the concrete implementation from outside (this is **Dependency Injection**, the pattern that implements DIP — see `System-design/22-design-patterns.md`).

## ❌ BAD — `Order` hard-wired to one concrete database
```js
class MySQLDatabase {
  save(order) { console.log(`Saving order to MySQL: ${JSON.stringify(order)}`); }
}

class OrderService {
  constructor() {
    this.db = new MySQLDatabase();   // 🔥 high-level OrderService welded to a low-level detail
  }
  placeOrder(order) { this.db.save(order); }
}
```
`OrderService` (high-level business logic — "place an order") directly depends on `MySQLDatabase` (a low-level implementation detail). Switching to Postgres, or mocking the DB in a unit test, means **editing `OrderService` itself**.

## ✅ REFACTORED — both depend on an abstraction
```js
class Database {                                  // the abstraction both sides depend on
  save(order) { throw new Error("must implement save()"); }
}
class MySQLDatabase extends Database {
  save(order) { console.log(`Saving order to MySQL: ${JSON.stringify(order)}`); }
}
class PostgresDatabase extends Database {
  save(order) { console.log(`Saving order to Postgres: ${JSON.stringify(order)}`); }
}

class OrderService {
  constructor(db) { this.db = db; }               // depends on Database, injected from outside
  placeOrder(order) { this.db.save(order); }
}

new OrderService(new MySQLDatabase()).placeOrder(order);     // production
new OrderService({ save: () => "saved (mock)" }).placeOrder(order);  // tests — no real DB needed
```
`OrderService` never changes when the database swaps. This is the exact `OrderService`/DI example already in `System-design/22-design-patterns.md` — DIP is the *principle*; DI is the *pattern*.

**Where this shows up in this repo's LLD problems:** DIP is the entire reason **Part 07 (LRU Cache)** and every entity-heavy problem should let storage/persistence be swapped in from outside rather than `new`'d internally — and it's why Part 04's framework step 6 says *"apply patterns... name which SOLID principle each choice serves."* A `ParkingLot` or `BookingService` that directly `new`'s a concrete `MySQLRepository` inside its constructor has the same problem as the bad `OrderService` above — use the Repository pattern (also in Part 22) injected via DI.

---

<a name="interview"></a>
# 7. Interview questions & answers

### Q: "What is the Single Responsibility Principle, and how do you spot a violation?"
> *"A class should have only one reason to change — one axis of responsibility, not necessarily one method. The smell is a class like Order that also calculates tax, sends emails, and logs — three unrelated teams, three unrelated reasons to touch the same file. I'd split it into Order for state, TaxCalculator, EmailService, and OrderLogger, each with a single reason to change, and have a thin orchestration function or service call all of them."*

### Q: "Explain Open/Closed with an example."
> *"A class should be open for extension but closed for modification — adding new behavior shouldn't mean editing existing, tested code. The classic smell is a growing if/else chain, like a DiscountCalculator that adds a new else-if for every customer tier. I'd refactor it into a Strategy pattern — each discount type is its own class implementing the same apply() method — so a new tier is a new class with zero edits to the calculator itself. This is exactly why a rate limiter's algorithm should be swappable via Strategy instead of an if/else on algorithm type."*

### Q: "What does Liskov Substitution actually mean in practice?"
> *"A subclass has to be usable anywhere its parent is expected without breaking the caller's assumptions. The classic violation is a GiftCard extending PaymentMethod but throwing on refund() — any code that trusts the parent's contract and calls refund() on a PaymentMethod silently blows up when it's actually a GiftCard. It's the same failure mode as Bird/Penguin and fly() — a subclass promising behavior it can't honestly deliver. The fix is usually to split the contract so a subclass only claims the capabilities it actually has, rather than inheriting and then lying about part of it."*

### Q: "What's Interface Segregation, and why does it matter if JS doesn't even have interfaces?"
> *"Don't force a class to implement methods it doesn't need — prefer several small, focused contracts over one fat one. The classic example is a Worker interface with work/eat/sleep, and then a RobotWorker forced to fake eat() and sleep() just to satisfy the shape. It matters in JS even without a real interface keyword, because the same forced-implementation problem shows up as convention-based contracts — you still end up with dead or throwing methods on a class that never needed them, and callers can't tell which methods are safe to call without reading the implementation."*

### Q: "What is Dependency Inversion, and how is it different from just doing Dependency Injection?"
> *"Dependency Inversion is the principle: high-level modules shouldn't depend on low-level, concrete details — both should depend on an abstraction. The smell is an OrderService that does 'new MySQLDatabase()' inside its own constructor — swapping databases or mocking in tests means editing OrderService itself. Dependency Injection is the pattern that implements the principle: instead of creating the dependency inside, you inject an abstraction — a Database interface — from outside, so OrderService works with MySQL in production and a mock in tests without ever changing. DIP is the 'what and why,' DI is the 'how.'"*

### Q: "Can you name a violation of each SOLID letter from a single bad class?"
> *"Take a God Order class that calculates totals, applies discounts through a growing if/else, refunds gift cards by throwing, exposes eat()/sleep()-style unrelated methods, and does 'new MySQLDatabase()' internally. That one class hits all five: multiple reasons to change is SRP, the if/else discount logic that needs editing for every new tier is OCP, a subclass throwing on a method the parent promised is LSP, forced unrelated methods is ISP, and the hard-wired concrete database is DIP. Real code rarely violates just one — SOLID violations cluster, which is why fixing SRP first usually makes the other four easier to see and fix too."*

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet

| Principle | One-line rule | Violation smell |
|---|---|---|
| **S** — Single Responsibility | A class should have only one reason to change | God class doing pricing + email + logging + persistence |
| **O** — Open/Closed | Open for extension, closed for modification | Growing `if/else`/`switch` edited every time a new type is added |
| **L** — Liskov Substitution | A subclass must be safely usable wherever its parent is expected | Subclass overrides a method just to throw/no-op (Bird/Penguin, GiftCard.refund) |
| **I** — Interface Segregation | Don't force a class to implement methods it doesn't need | Fat interface with unrelated methods; concrete class fakes/throws on the ones it can't support |
| **D** — Dependency Inversion | High-level code depends on abstractions, not concrete low-level details | `new ConcreteDatabase()` hard-coded inside a service's constructor |

### The pattern-to-principle map
- **OCP → Strategy** (swap algorithm without editing the caller — Part 08 Rate Limiter, Part 05 Parking pricing, Part 11 Splitwise splits).
- **DIP → Dependency Injection + Repository** (`System-design/22-design-patterns.md`).
- **LSP → composition over inheritance** ([`00-oop-recap.md`](00-oop-recap.md) — same root cause, different name).
- **SRP → most patterns generally** — a class doing one job is what makes it easy to name what pattern (if any) it deserves.

### How to rehearse this out loud
Say each letter with: **definition → one bad code smell → the one-sentence fix.** That's what the Q&A section above models — an interviewer wants to see you *recognize* a violation in unfamiliar code, not just recite the acronym.

### Connects to
- [`00-oop-recap.md`](00-oop-recap.md) — SOLID is OOP fundamentals with names; LSP especially is the Bird/Penguin problem formalized.
- `System-design/22-design-patterns.md` — Strategy (OCP), Dependency Injection + Repository (DIP) are the patterns that implement these principles in real code.
- Part 03 — Design patterns for LLD (State, Decorator, Adapter, etc.) — most exist to satisfy OCP or DIP in a specific shape.
- Every Phase 3 problem in `00-ROADMAP.md` — SOLID is the lens every one of them gets reviewed through.

### Suggested next
- **Part 02 — UML basics** (drawing has-a/is-a and class relationships before coding).
- **Part 03 — Design patterns for LLD** (State, Decorator, Adapter, Facade, Command, Chain of Responsibility, Composite, Template Method, Iterator, Proxy).
- **Part 04 — The LLD problem-solving framework** (where SOLID gets applied step-by-step to a live prompt).

*— End of Part 01 —*
