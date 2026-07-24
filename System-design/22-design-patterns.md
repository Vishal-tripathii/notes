# System Design Study Notes — Part 22

## Design Patterns (Interview Understanding + Code Reference)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Interview-level: what · where useful · analogy · trade-offs · code · Q&A.
>
> **Note:** Observer is the pattern behind pub/sub & Event-Driven Architecture (Part 14). Dependency Injection + Repository are how modern apps stay testable.

---

## Table of Contents

1. [Quick map (3 categories)](#map)
2. [Creational: Singleton, Factory, Builder](#creational)
3. [Behavioral: Strategy, Observer](#behavioral)
4. [Architectural: Dependency Injection, Repository](#architectural)
5. [Code examples (all 7)](#code)
6. [How they combine](#combine)
7. [Interview Q&A](#interview)
8. [Cheat Sheet](#cheatsheet)

---

<a name="map"></a>
# 1. Quick map (patterns fall into 3 buckets)

- **Creational** (how objects are made): Singleton, Factory, Builder
- **Behavioral** (how objects interact): Strategy, Observer
- **Architectural** (structuring an app): Dependency Injection, Repository

---

<a name="creational"></a>
# 2. Creational

## Singleton — exactly one instance
- **What:** ensure a class has **only one instance** with a global access point.
- **Where:** things you want one of — **config**, **logger**, **DB connection pool**, **cache** client.
- **Analogy:** one **government** — everyone refers to the same one.
- **Trade-offs:** ❌ global state (hard to test) · hidden dependencies · concurrency issues · often an **anti-pattern** when overused (prefer DI).

## Factory — delegate object creation
- **What:** a method/class that **creates objects**, hiding creation logic, returning a common interface — often deciding *which* type at runtime.
- **Where:** object depends on input/config — **payment processor** (Stripe vs PayPal), file parsers.
- **Analogy:** a **restaurant kitchen** — you order "a burger"; the kitchen builds it.
- **Trade-offs:** ✅ decouples caller from concrete classes · ❌ more classes/indirection.

## Builder — construct complex objects step by step
- **What:** build a complex object **piece by piece** (separate construction from result) — vs a giant constructor.
- **Where:** many **optional fields** or immutable objects — HTTP request, complex query, config.
- **Analogy:** a **Subway sandwich** — bread → fillings → sauce → "make it."
- **Trade-offs:** ✅ readable (fluent), avoids telescoping constructors · ❌ boilerplate; overkill for simple objects.

---

<a name="behavioral"></a>
# 3. Behavioral

## Strategy — swappable algorithms
- **What:** a **family of interchangeable algorithms**, picked at **runtime**; behavior passed in, not hard-coded.
- **Where:** multiple ways to do one thing — **payment methods**, **sorting**, **pricing/discounts**, **compression**. Replaces big `if/else` over behaviors.
- **Analogy:** **GPS route options** — "fastest," "shortest," "avoid tolls."
- **Trade-offs:** ✅ removes conditionals, easy to add strategies · ❌ more classes; client must choose.

## Observer — notify many on change
- **What:** **one-to-many** — when the *subject* changes, all **observers are notified automatically**.
- **Where:** **event systems**, **notifications**, **UI updates**; the pattern behind **pub/sub & EDA (Part 14)**.
- **Analogy:** a **YouTube channel** — subscribe, get notified of every post.
- **Trade-offs:** ✅ loose coupling (subject doesn't know observers) · ❌ cascading updates, ordering, **memory leaks** if not unsubscribed.

---

<a name="architectural"></a>
# 4. Architectural

## Dependency Injection (DI) — pass dependencies in
- **What:** a class **receives** its dependencies from outside instead of **creating** them inside.
- **Where:** everywhere in modern apps — backbone of **Spring, Angular, NestJS**. Biggest win: **testability**.
- **Analogy:** a **chef doesn't grow his own vegetables** — ingredients are **delivered**.
- **Trade-offs:** ✅ decoupling + testability (real DB in prod, **mock** in tests) · swap implementations freely · ❌ indirection; often needs a DI container.

## Repository — abstract the data layer
- **What:** a layer **between business logic and the database**; code asks for data via a clean interface (`userRepo.findById(42)`) without DB details.
- **Where:** decouple business logic from data access — swap DB, mock in tests, centralize queries.
- **Analogy:** a **librarian** — ask for a book; you don't care how/where it's stored.
- **Trade-offs:** ✅ decoupled + testable, centralized queries · ❌ extra layer; overkill for simple CRUD.

---

<a name="code"></a>
# 5. Code examples (all 7)

## Singleton
```js
class Logger {
  constructor() {
    if (Logger.instance) return Logger.instance;  // return existing one
    this.logs = [];
    Logger.instance = this;                        // cache the only instance
  }
  log(msg) { this.logs.push(msg); console.log(msg); }
}
const a = new Logger();
const b = new Logger();
console.log(a === b);  // true → same single instance
```

## Factory
```js
class StripeProcessor { pay(amt) { return `Stripe: $${amt}`; } }
class PayPalProcessor { pay(amt) { return `PayPal: $${amt}`; } }

function paymentFactory(type) {           // decides WHICH one to create
  switch (type) {
    case "stripe": return new StripeProcessor();
    case "paypal": return new PayPalProcessor();
    default: throw new Error("Unknown payment type");
  }
}
const processor = paymentFactory("stripe");   // caller doesn't `new` a concrete class
console.log(processor.pay(100));              // "Stripe: $100"
```

## Builder
```js
class RequestBuilder {
  constructor() { this.req = { headers: {} }; }
  url(u)       { this.req.url = u; return this; }     // return this → chaining
  method(m)    { this.req.method = m; return this; }
  header(k, v) { this.req.headers[k] = v; return this; }
  body(b)      { this.req.body = b; return this; }
  build()      { return this.req; }                   // final object
}
const request = new RequestBuilder()
  .url("/api/users").method("POST")
  .header("Content-Type", "application/json")
  .body({ name: "Alice" }).build();
// no 10-argument constructor — readable, optional fields
```

## Strategy
```js
const strategies = {                       // interchangeable algorithms
  fastest:  (route) => `Fastest route for ${route}`,
  shortest: (route) => `Shortest route for ${route}`,
  noTolls:  (route) => `No-tolls route for ${route}`,
};
class Navigator {
  constructor(strategy) { this.strategy = strategy; }
  setStrategy(strategy) { this.strategy = strategy; }   // swap at runtime
  navigate(route)       { return this.strategy(route); }
}
const nav = new Navigator(strategies.fastest);
console.log(nav.navigate("Home→Work"));   // Fastest...
nav.setStrategy(strategies.noTolls);       // change behavior, no if/else
console.log(nav.navigate("Home→Work"));   // No-tolls...
```

## Observer
```js
class Channel {                       // the SUBJECT
  constructor() { this.subscribers = []; }
  subscribe(fn)   { this.subscribers.push(fn); }
  unsubscribe(fn) { this.subscribers = this.subscribers.filter(s => s !== fn); }
  publish(video)  { this.subscribers.forEach(fn => fn(video)); }  // notify all
}
const channel = new Channel();
const alice = (v) => console.log(`Alice watches ${v}`);
const bob   = (v) => console.log(`Bob watches ${v}`);
channel.subscribe(alice);
channel.subscribe(bob);
channel.publish("New Video!");   // both notified automatically
// channel doesn't know WHO subscribers are → loose coupling (EDA idea)
```

## Dependency Injection
```js
// ❌ WITHOUT DI: creates its own dependency (hard to test)
class OrderServiceBad {
  constructor() { this.db = new PostgresDB(); }   // hard-coded → can't swap/mock
}
// ✅ WITH DI: dependency is passed IN
class OrderService {
  constructor(db) { this.db = db; }               // injected from outside
  placeOrder(o)   { return this.db.save(o); }
}
const service = new OrderService(new PostgresDB());     // production
const mockDb = { save: (o) => "saved (mock)" };         // tests
console.log(new OrderService(mockDb).placeOrder({}));   // "saved (mock)"
```

## Repository
```js
class UserRepository {                // hides HOW/WHERE data is stored
  constructor(db) { this.db = db; }
  findById(id)   { return this.db.query(`SELECT * FROM users WHERE id=${id}`); }
  save(user)     { return this.db.insert("users", user); }
  findByEmail(e) { return this.db.query(`SELECT * FROM users WHERE email='${e}'`); }
}
class UserService {
  constructor(userRepo) { this.userRepo = userRepo; }   // (also DI!)
  getProfile(id) { return this.userRepo.findById(id); }
}
// swap Postgres → Mongo, or inject a fake repo in tests — UserService never changes
```

---

<a name="combine"></a>
# 6. How they combine (the realistic picture)

Patterns **stack** in real code:
```js
const userRepo = new UserRepository(new PostgresDB());   // Repository + DI
const orderService = new OrderService(userRepo);         // DI
const processor = paymentFactory(user.preferredMethod);  // Factory
new Logger().log("Order placed");                        // Singleton
```
> **Interview insight:** patterns aren't used in isolation — a single request often flows through several (DI provides a Repository, a Factory picks a processor, a Strategy runs the algorithm, Observers react, a Singleton logs).

---

<a name="interview"></a>
# 7. Interview Q&A

### Q: "Singleton — when to use, any downsides?"
> *"It ensures a class has one instance with a global access point — useful for a config, logger, or DB connection pool. The downside is it's global state, which makes testing hard and hides dependencies, and it's an anti-pattern when overused. In modern code I'd often use dependency injection to provide a single instance instead — same benefit, without the global-state problems."*

### Q: "Factory vs Strategy — aren't they similar?"
> *"Different intents. Factory is creational — it decides which object to create and hides construction, like returning a Stripe or PayPal processor. Strategy is behavioral — it swaps an algorithm at runtime after the object exists, like choosing a sorting or pricing strategy. Factory = which object you get; Strategy = which behavior it runs."*

### Q: "When would you use Observer?"
> *"When one change needs to notify many parts automatically — event systems, notifications, UI re-rendering on state change. It's the pattern behind pub/sub and event-driven architecture: the subject publishes and subscribers react without it knowing who they are. The catch is managing unsubscribes to avoid memory leaks."*

### Q: "Why is Dependency Injection useful?"
> *"It decouples a class from its dependencies by passing them in instead of creating them inside. The biggest win is testability — inject a real database in production and a mock in tests, without changing the class. It also lets me swap implementations freely. The cost is indirection and usually a DI container. It's the modern alternative to hard-coded dependencies and overused singletons."*

### Q: "What problem does Repository solve?"
> *"It decouples business logic from data access. Instead of scattering queries through the app, code asks a repository like userRepo.findById, which handles the actual data source. So I can swap the database, centralize query logic, and mock the repository in tests. The trade-off is an extra layer that can be overkill for simple apps."*

### Q: "When would you reach for a Builder?"
> *"When constructing an object with many optional parameters, or when I want it immutable. Instead of a ten-argument telescoping constructor, I build step by step with a fluent API and call build at the end — good for an HTTP request or a complex query. For simple objects it's unnecessary boilerplate."*

---

<a name="cheatsheet"></a>
# 8. Cheat Sheet

| Pattern | Category | One-liner | Analogy | Key trade-off |
|---|---|---|---|---|
| **Singleton** | Creational | One instance, globally | One government | Global state (anti-pattern risk) |
| **Factory** | Creational | Delegate which object to create | Kitchen builds order | Extra classes |
| **Builder** | Creational | Build complex objects step by step | Subway sandwich | Boilerplate |
| **Strategy** | Behavioral | Swap algorithms at runtime | GPS routes | More classes |
| **Observer** | Behavioral | Notify many on change | YouTube subs | Memory leaks if not unsub'd |
| **Dependency Injection** | Architectural | Pass dependencies in | Ingredients delivered | Indirection / container |
| **Repository** | Architectural | Abstract the data layer | Librarian | Extra layer |

### Key distinctions
- **Factory vs Strategy:** which *object* you get vs which *behavior* it runs.
- **Singleton vs DI:** global static instance vs injected (preferred, testable).
- **Observer = pub/sub = EDA** (Part 14).
- **Repository + DI** together = the testable data layer.

### One-liner
Every pattern trades **extra abstraction/classes** for **decoupling, flexibility, and testability**.

### Connects to
- Part 14: Observer → pub/sub → EDA. · Part 8: Repository → DB abstraction. · Part 20: Factory/Strategy in real services.

### Suggested next
- **Object vs block vs file storage**.
- **Design Dropbox / Google Drive**.
- **Full system design walkthrough**.

*— End of Part 22 —*
