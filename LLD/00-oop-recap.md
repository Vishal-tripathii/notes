# LLD Study Notes — Part 00 — OOP Recap

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, code, analogies, and interview Q&A included.
>
> **Continues from:** [`00-ROADMAP.md`](00-ROADMAP.md) — this is Phase 0, the prerequisite before SOLID (Part 01) and design patterns (Part 03, and [`System-design/22-design-patterns.md`](../System-design/22-design-patterns.md)). Every problem in Phase 3 (Parking Lot, Elevator, BookMyShow…) leans on the vocabulary built here.

---

## Table of Contents

1. [Why this part exists — LLD is "OOP under a time limit"](#why)
2. [Encapsulation](#encapsulation)
3. [Composition vs inheritance (has-a vs is-a)](#composition)
4. [Why inheritance breaks — the Bird/Penguin problem](#bird)
5. [Polymorphism — compile-time vs runtime](#polymorphism)
6. [Abstraction](#abstraction)
7. [Interface vs abstract class (and JS/TS)](#interface)
8. [Interview questions & answers](#interview)
9. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="why"></a>
# 1. Why this part exists — LLD is "OOP under a time limit"

An LLD interview looks like it's testing "can you design a parking lot," but what it's **actually** testing is whether your four pillars of OOP — encapsulation, inheritance/composition, polymorphism, abstraction — are reflexive enough to apply correctly **while someone is watching the clock**.

Every "good" LLD answer traces back to one of these fundamentals:
- "I made `balance` private with a `deposit()` method" → **encapsulation**.
- "I used composition instead of a deep inheritance tree" → **composition over inheritance**.
- "Each `PricingStrategy` implements the same `calculate()` method differently" → **polymorphism**.
- "The `PaymentGateway` interface hides Stripe/PayPal details" → **abstraction**.

> **The pattern:** SOLID (Part 01) and design patterns (Part 03) are just **named, battle-tested applications of these four ideas**. If OOP fundamentals are shaky, SOLID becomes acronym-memorization instead of reasoning — this part is the foundation everything else stands on.

---

<a name="encapsulation"></a>
# 2. Encapsulation

**Bundle data with the methods that operate on it, and hide the internal state behind a controlled interface.** The object decides how it can be changed — callers don't reach in and mutate fields directly.

```js
// ❌ NO encapsulation — anyone can set balance to anything, including negative
class BankAccountBad {
  constructor(balance) { this.balance = balance; }
}
const acc = new BankAccountBad(100);
acc.balance = -9999;   // nothing stops this

// ✅ encapsulation — balance is private, changes go through validated methods
class BankAccount {
  #balance;                              // JS private field (# syntax)
  constructor(balance) { this.#balance = balance; }
  deposit(amt)  { if (amt > 0) this.#balance += amt; }
  withdraw(amt) {
    if (amt > 0 && amt <= this.#balance) this.#balance -= amt;
    else throw new Error("Insufficient funds");
  }
  getBalance() { return this.#balance; }  // read-only view out
}
```

## Analogy: an ATM 🏧
You never touch the bank's ledger directly. You interact through a **controlled interface** — insert card, enter PIN, choose "withdraw" — and the machine enforces the rules (can't withdraw more than the balance) behind the scenes. That controlled surface *is* encapsulation.

**Why it matters in LLD:** every entity class (`ParkingSpot`, `Seat`, `Account`) should protect its own invariants — a `ParkingSpot` shouldn't let two callers directly flip `isOccupied` without going through `occupy()`/`vacate()`, because that's exactly where double-booking bugs sneak in (see Part 12, BookMyShow).

---

<a name="composition"></a>
# 3. Composition vs inheritance (has-a vs is-a)

- **Inheritance ("is-a")** — a subclass **is a** specialized version of a parent class, and inherits its structure/behavior. `Car extends Vehicle`.
- **Composition ("has-a")** — an object is **built out of** other objects, and delegates to them. `Car` **has an** `Engine`.

```
Inheritance (is-a):        Composition (has-a):
   Vehicle                    Car
     ▲                         │  has-a
     │                         ▼
    Car                     Engine
```

## Why composition is the safer default
Inheritance locks in a relationship **at compile time**, all the way down the hierarchy — every subclass is forced to inherit *everything* the parent has, whether it fits or not. Composition is assembled **at runtime** from interchangeable parts, so you can swap a piece (a different `Engine`, a different `PricingStrategy`) without touching the class hierarchy.

```js
// Composition: swap the engine without touching Car at all
class Engine { start() { return "vroom"; } }
class ElectricEngine { start() { return "silent hum"; } }

class Car {
  constructor(engine) { this.engine = engine; }   // has-a, injected
  drive() { return this.engine.start(); }
}
new Car(new Engine()).drive();          // "vroom"
new Car(new ElectricEngine()).drive();  // "silent hum" — no Car subclass needed
```

> This is also **Dependency Injection** (see `System-design/22-design-patterns.md`) — composition is the OOP principle; DI is the pattern that implements it cleanly.

---

<a name="bird"></a>
# 4. Why inheritance breaks — the Bird/Penguin problem

The **classic interview example** for "why composition over inheritance" is a bird hierarchy built around a `fly()` method:

```js
// ❌ The trap
class Bird {
  fly() { return "flying"; }
}
class Sparrow extends Bird {}   // fine — sparrows fly
class Penguin extends Bird {}   // 🔥 penguins can't fly!

const p = new Penguin();
p.fly();   // "flying" — WRONG, but compiles fine and nothing warns you
```

`Penguin` **is a** `Bird` biologically, but `Bird.fly()` assumed **all** birds fly — an assumption baked into the parent class. Now every new bird (ostrich, kiwi, penguin) either:
1. Inherits a broken `fly()` and lies about its own behavior, or
2. Overrides `fly()` to throw an error — which **violates Liskov Substitution** (Part 01): a `Penguin` can no longer be used wherever a `Bird` is expected without surprising behavior.

```js
// ✅ Fix: pull "flying" out into composition — only fliers get it
class Bird {
  constructor(name) { this.name = name; }
}
const canFly = {
  fly() { return `${this.name} is flying`; }
};

class Sparrow extends Bird {}
Object.assign(Sparrow.prototype, canFly);   // mix in flying behavior

class Penguin extends Bird {}   // no fly() at all — correctly can't fly

new Sparrow("Sparrow").fly();   // "Sparrow is flying"
new Penguin("Penguin").fly();   // TypeError: fly is not a function — correct!
```

Now behavior is **composed in only where it applies**, instead of inherited and then patched around. This is the textbook justification interviewers are listening for: *"deep inheritance hierarchies force behavior onto subclasses that don't actually have it, which is exactly what happened with Penguin and fly() — composition lets you attach only the capabilities that are actually true."*

> **Where this shows up in the roadmap:** Part 10 (Tic-Tac-Toe & Chess) explicitly calls out chess piece design as "a classic composition-over-inheritance trap" — a `Piece` interface with composed movement behavior beats `Pawn extends Piece extends GamePiece`.

---

<a name="polymorphism"></a>
# 5. Polymorphism — compile-time vs runtime

**Polymorphism = "many forms"** — the same method name behaves differently depending on the object (or arguments) it's called with.

## Runtime polymorphism (method overriding) — the one JS has natively
A subclass **overrides** a parent's method; the correct version is picked **at runtime** based on the actual object.

```js
class PricingStrategy {
  calculate(amount) { throw new Error("not implemented"); }
}
class FlatPricing extends PricingStrategy {
  calculate(amount) { return amount; }
}
class SurgePricing extends PricingStrategy {
  calculate(amount) { return amount * 1.5; }
}

function charge(strategy, amount) {
  return strategy.calculate(amount);   // which calculate() runs? decided at runtime
}
charge(new FlatPricing(), 100);    // 100
charge(new SurgePricing(), 100);   // 150 — same call site, different behavior
```

## Compile-time polymorphism (method overloading) — JS does NOT have this
In languages like Java/C++, you can define **multiple methods with the same name but different parameter lists**, and the compiler picks the right one at compile time based on argument types/count. **JavaScript has no true overloading** — a later function declaration with the same name simply **replaces** the earlier one.

```js
class Calc {
  add(a, b) { return a + b; }
}
// Redefining add with a 3rd param doesn't "overload" — it OVERWRITES.
Calc.prototype.add = function (a, b, c) { return a + b + c; };
new Calc().add(1, 2);   // NaN-ish bug — the 2-arg version is gone
```

**How JS simulates overloading instead:**
```js
class Calc {
  // 1. Default parameters
  add(a, b, c = 0) { return a + b + c; }

  // 2. Rest params + variable arg count
  addAll(...nums) { return nums.reduce((s, n) => s + n, 0); }

  // 3. Runtime type/shape checking inside one method
  move(target) {
    if (typeof target === "number") return `move by ${target} steps`;
    if (typeof target === "object")  return `move to (${target.x}, ${target.y})`;
  }
}
```

| | Overloading (compile-time) | Overriding (runtime) |
|---|---|---|
| Same class or subclass? | Same class, different signatures | Parent → child, same signature |
| Decided when | Compile time (by param types/count) | Runtime (by actual object's type) |
| JS support | ❌ No native support — simulated via default/rest params or type checks | ✅ Fully supported — every subclass method override |
| Interview line | "JS doesn't have true overloading, but you can simulate it with default parameters, rest args, or a type-check inside one method." | "This is normal polymorphism — every Strategy pattern in Part 03 is runtime polymorphism." |

---

<a name="abstraction"></a>
# 6. Abstraction

**Expose only what a caller needs to know; hide the implementation details behind a simple surface.** Where encapsulation hides *state*, abstraction hides *complexity of behavior*.

```js
class PaymentGateway {
  pay(amount) {
    this.#validateCard();
    this.#contactBank();
    this.#deductFunds(amount);
    return "paid";
  }
  #validateCard() { /* ... */ }
  #contactBank()  { /* ... */ }
  #deductFunds()  { /* ... */ }
}
// Caller only ever sees: gateway.pay(500) — none of the private steps.
```

## Analogy: driving a car 🚗
You press the accelerator; you don't need to know about fuel injection timing or the combustion cycle. The **pedal is the abstraction** — a simple interface hiding a genuinely complex system underneath.

**Encapsulation vs abstraction, side by side:**
- **Encapsulation** = *how* you hide it (private fields, access control).
- **Abstraction** = *what* you choose to hide (the design decision of which details the caller doesn't need).

---

<a name="interface"></a>
# 7. Interface vs abstract class (and how JS/TS approximates them)

| | Interface | Abstract class |
|---|---|---|
| **What** | A pure **contract** — method signatures only, zero implementation | A **partial** class — can mix implemented methods + abstract (unimplemented) ones |
| **State** | No fields/state | Can hold shared fields/state |
| **Inheritance** | A class can implement **many** interfaces | A class can extend only **one** abstract class |
| **Use when** | You just need to guarantee "this object has these methods" (a shape/contract) — e.g. `Comparable`, `Serializable` | You want to share **common code** across subclasses **and** force them to implement the rest — e.g. a `Shape` base with a shared `describe()` but abstract `area()` |
| **Analogy** | A job description — "must be able to do X, Y, Z," no implementation supplied | A half-built house — foundation and walls done (shared), you finish the interior (overridden) |

## JavaScript has neither keyword — how the language fakes both

**JS has no `interface` and no `abstract class` keyword.** Both are approximated by convention:

```js
// "Interface" in plain JS — a contract enforced only by convention/duck typing
class PaymentMethod {
  pay(amount) { throw new Error("pay() must be implemented"); }
}
class CreditCard extends PaymentMethod {
  pay(amount) { return `Charged $${amount} to credit card`; }
}
// Nothing stops someone from forgetting to override pay() until it's called —
// JS can't check this at compile time; the "interface" is a promise, not a rule.
```

```js
// "Abstract class" in plain JS — enforced by throwing in the constructor
class Shape {
  constructor() {
    if (new.target === Shape) throw new Error("Shape is abstract — cannot instantiate directly");
  }
  describe() { return `Area is ${this.area()}`; }   // shared, concrete
  area() { throw new Error("area() must be implemented"); }  // "abstract" method
}
class Circle extends Shape {
  constructor(r) { super(); this.r = r; }
  area() { return Math.PI * this.r ** 2; }   // must override, or describe() breaks
}
new Shape();          // throws — can't instantiate the "abstract" class
new Circle(5).describe();  // works — shared logic + overridden area()
```

## TypeScript gives you both, for real
```ts
// TS has a real `interface` keyword — checked at compile time
interface PaymentMethod {
  pay(amount: number): string;
}
class CreditCard implements PaymentMethod {
  pay(amount: number) { return `Charged $${amount}`; }
  // forgetting pay() here is a COMPILE ERROR in TS — unlike plain JS
}

// TS also has real `abstract class`
abstract class Shape {
  describe() { return `Area is ${this.area()}`; }
  abstract area(): number;   // no body — TS enforces subclasses implement it
}
```

> **Interview line:** *"JavaScript has no native interface or abstract class keyword — both are simulated by convention: an interface is a class whose methods throw until overridden (duck typing, checked only at runtime), and an abstract class does the same but also shares real implemented methods. TypeScript adds both as real, compiler-enforced constructs, which is one reason TS is preferred for anything where contracts actually need to be guaranteed."*

---

<a name="interview"></a>
# 8. Interview questions & answers

### Q: "Why prefer composition over inheritance?"
> *"Inheritance locks a relationship in at design time and forces every subclass to inherit everything the parent has, even behavior that doesn't apply — the classic example is a Bird class with a fly() method, where Penguin extends Bird but can't actually fly. You either let it lie about flying or override fly() to throw, which breaks Liskov Substitution. Composition avoids that by assembling behavior out of smaller, swappable pieces at runtime — you only attach the capabilities an object actually has, and you can swap a piece, like a pricing strategy or a payment gateway, without touching the class hierarchy at all."*

### Q: "What's the difference between encapsulation and abstraction? People mix these up."
> *"Encapsulation is about hiding state — bundling data with the methods that control it, so nothing can mutate it directly, like a private balance field only changeable through deposit and withdraw. Abstraction is about hiding complexity of behavior — exposing a simple interface, like pay(amount), while hiding the validation, bank call, and deduction steps behind it. Encapsulation is the 'how' — access control; abstraction is the 'what' — the design decision of which details the caller doesn't need to see."*

### Q: "Does JavaScript support method overloading?"
> *"Not natively. If you declare two methods with the same name, the second one just overwrites the first — there's no compile-time dispatch based on argument types like in Java. JS simulates overloading with default parameters, rest arguments, or by checking typeof/shape of the arguments inside a single method. What JS does support natively is runtime polymorphism — method overriding — where a subclass overrides a parent's method and the correct version runs based on the actual object at runtime."*

### Q: "Interface vs abstract class — when would you use each, and how does this even work in JS?"
> *"An interface is a pure contract — just method signatures, no implementation, and a class can implement many of them. An abstract class can share real implemented code across subclasses while still forcing them to implement certain methods, but a class can only extend one. I'd use an interface when I just need to guarantee a shape — like 'this has a pay method' — and an abstract class when there's real shared logic to reuse. JavaScript has no interface or abstract class keyword at all — both are conventions: an abstract class throws in its constructor if instantiated directly and has methods that throw until overridden; an interface is the same idea without the shared state. TypeScript adds both as real, compiler-checked constructs, which is why I'd reach for TS the moment contracts actually need enforcement instead of just convention."*

### Q: "Why do people say LLD interviews are 'OOP under a time limit'?"
> *"Because every strong LLD answer — SOLID compliance, picking Strategy over a big if/else, using composition for a Piece hierarchy in chess — is really just encapsulation, composition, polymorphism, and abstraction applied correctly, but you have to do it live, under 35-40 minutes, while also handling a moving-target prompt and a 'now add feature X' follow-up. The patterns and SOLID principles are named shortcuts for these fundamentals; if the fundamentals aren't reflexive, you spend interview time re-deriving them instead of applying them."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet — everything on one page

### The four pillars
- **Encapsulation** — hide state behind controlled methods (private fields + getters/validated setters).
- **Abstraction** — hide complexity behind a simple interface (caller sees `pay()`, not the internals).
- **Inheritance (is-a)** — subclass extends parent, inherits everything — locked in at design time.
- **Composition (has-a)** — object built from swappable parts, assembled/injected at runtime.

### Composition over inheritance
- **Default to composition.** Reach for inheritance only for a genuine, stable "is-a" with no behavioral exceptions.
- **The tell:** if a subclass has to override a method just to throw/no-op (Penguin.fly()), that's Liskov Substitution breaking — a signal to switch to composition.

### Polymorphism
| | Compile-time (overloading) | Runtime (overriding) |
|---|---|---|
| JS native support | ❌ No — simulate with default params/rest args/type checks | ✅ Yes — every subclass method override |
| Decided | By signature, at compile time | By actual object, at runtime |

### Interface vs abstract class
| | Interface | Abstract class |
|---|---|---|
| Implementation | None — contract only | Partial — some shared, some abstract |
| Multiple inheritance | ✅ implement many | ❌ extend only one |
| In plain JS | Convention: methods throw until overridden | Convention: constructor throws on direct `new`, some methods concrete |
| In TS | Real `interface` keyword, compiler-checked | Real `abstract class` keyword, compiler-checked |

### Golden rules
- Composition over inheritance, by default.
- If a subclass "is-a" parent but can't honestly do everything the parent promises → wrong hierarchy (Bird/Penguin).
- JS has no true overloading — don't claim it does; simulate with defaults/rest/type checks.
- JS has no `interface`/`abstract` keywords — both are enforced by convention, not the compiler; TS makes them real.

### Connects to
- Part 01 (SOLID) — Liskov Substitution is this file's Bird/Penguin problem, formalized.
- Part 03 / `System-design/22-design-patterns.md` — Strategy, Observer etc. are all named applications of runtime polymorphism + composition.
- Part 10 (Tic-Tac-Toe & Chess) — the piece hierarchy is this file's composition-over-inheritance trap, applied.

### Suggested next
- **Part 01 — SOLID principles** (direct continuation).
- **Part 02 — UML basics** (drawing has-a/is-a before coding).
- **Part 03 — Design patterns for LLD.**

*— End of Part 00 —*
