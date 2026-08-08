# 🎯 JD-Targeted Prep — Full Stack Developer (Node.js, 3 YOE)

> Built directly from a specific JD: Node.js + Express, MongoDB, Redis, Socket.IO, Microservices, JWT, MVC/SOLID, REST, React (class + functional), AWS.
>
> **How to use:** cover the answer, say yours out loud, then compare. This file only covers what your existing notes *don't* already cover well — see the coverage map first so you don't re-study material you've already got.

---

## 0. Coverage Map — what's already handled elsewhere

| JD skill | Where it's already covered | Still needed here |
|---|---|---|
| Node.js core, Event Loop, Streams, Worker Threads, Security, Scaling | [nodejs/QNA-INTERVIEW-BANK.md](QNA-INTERVIEW-BANK.md) | — well covered |
| MongoDB (CRUD, indexes, aggregation, populate, embedding) | [database/00-ROADMAP.md](../database/00-ROADMAP.md) Parts 05–09, [nodejs bank §26](QNA-INTERVIEW-BANK.md#s26) | — well covered |
| Redis (caching, TTL, cache-aside, rate limiting) | [database/00-ROADMAP.md](../database/00-ROADMAP.md) Part 11, [nodejs bank](QNA-INTERVIEW-BANK.md) (search "Redis") | — well covered |
| JWT basics, sessions vs tokens | [nodejs bank §19](QNA-INTERVIEW-BANK.md#s19) | Deeper JWT (§5 below) |
| React (class + functional, hooks) | [React/QNA-INTERVIEW-BANK.md](../React/QNA-INTERVIEW-BANK.md) | — well covered |
| Microservices (queue/worker pattern) | [nodejs bank](QNA-INTERVIEW-BANK.md) (search "Microservices") | Deeper microservices (§4 below) |
| **OOP & SOLID principles** | not covered | **§1 below** |
| **MVC pattern** | not covered | **§2 below** |
| **Socket.IO / real-time** | not covered | **§3 below** |
| **REST vs SOAP, API design/optimization** | partial (nodejs bank §24) | **§6 below** |
| jQuery | not covered | **§7 below** (quick — legacy skill) |
| "Hibernate / JPA" in the skills list | N/A | **§8 below** — flag this, it's a Java-stack mismatch |

---

<a name="s1"></a>
## 1. OOP Concepts & SOLID Principles

### Does OOP even apply to JavaScript?
Yes, but through prototypes, not classical classes. `class` syntax is sugar over prototypal inheritance — an object's methods live on its prototype, and property lookup walks the prototype chain until it finds a match or hits `null`.

### What are the four pillars of OOP, in a Node context?
**Encapsulation** — hiding internals behind a small interface (private class fields `#x`, or closures in a factory function).
**Abstraction** — exposing *what* a service does, not how (a `UserService.createUser()` hides hashing, validation, DB writes).
**Inheritance** — `class Admin extends User` for shared behaviour, though composition is preferred in most Node codebases.
**Polymorphism** — same method name, different behaviour per type — e.g. every payment provider implements `.charge()`, called identically by the caller.

### Composition vs inheritance — which do you reach for in Node?
Composition, by default. Inheritance couples a subclass to its parent's implementation forever; if the parent changes, every child risks breaking. Composition — passing in a `logger`, a `db`, a `paymentGateway` as dependencies — keeps pieces swappable and testable in isolation. Inheritance earns its place only for genuine is-a relationships with stable shared behaviour.

### What is SOLID?
Five principles for code that survives change without becoming fragile:
**S**ingle Responsibility, **O**pen/Closed, **L**iskov Substitution, **I**nterface Segregation, **D**ependency Inversion.

### Single Responsibility Principle — with a Node example.
A class or module should have one reason to change. A `UserController` that validates input, hashes passwords, writes to Mongo, *and* sends welcome emails has four reasons to change — split it into a controller, a `UserService`, and a `MailService`. Each can change independently without risking the others.

### Open/Closed Principle — with a Node example.
Open for extension, closed for modification. A payment module that switches on `if (type === 'stripe') ... else if (type === 'paypal')` must be edited every time a provider is added. A strategy pattern — each provider implements a common `charge()` interface, looked up from a registry — lets you add a provider without touching existing code.

### Liskov Substitution Principle — with a Node example.
A subclass must be usable anywhere its parent is expected, without breaking the caller's assumptions. If `ReadOnlyUser extends User` but throws on `save()`, any code that calls `user.save()` polymorphically now breaks for that subtype — a violation. The fix is usually to not model it as inheritance at all.

### Interface Segregation Principle — in a language with no interfaces?
Applied as a convention: don't force a consumer to depend on methods it doesn't use. A single bloated `Repository` object with 20 methods forces every consumer to know about all 20; splitting into `UserReader` and `UserWriter` lets read-only code depend on only what it reads.

### Dependency Inversion Principle — with a Node example.
High-level modules shouldn't depend on low-level details; both should depend on abstractions. A `UserService` that does `const db = require('./mongoConnection')` directly is welded to Mongo. Instead, inject a `db` with a known interface (`find`, `save`) — the service doesn't care if it's Mongo, Postgres, or a test double. This is what makes unit testing without a real DB possible.
⚠️ In practice for Node, "dependency inversion" mostly just means **dependency injection** — pass collaborators in rather than requiring them inline.

### How would you unit test a service that talks to MongoDB, without a real DB?
Depend on an injected repository interface, not the Mongoose model directly. In the test, pass a fake object implementing `find`/`save` that returns canned data. That's SOLID's D and I principles paying off directly — untestable code is usually a sign of a design that didn't invert its dependencies.

### What's a design pattern you've actually used in a Node backend?
**Singleton** — one shared DB connection pool, module-cached by `require`'s caching behaviour.
**Factory** — `createLogger(config)` returning a configured instance without the caller knowing the concrete class.
**Strategy** — interchangeable algorithms behind one interface (payment providers, auth strategies in Passport.js).
**Middleware / Chain of Responsibility** — Express middleware itself: each handler decides to act, pass on, or short-circuit.
**Repository** — wrapping Mongoose models behind a data-access layer so business logic never imports Mongoose directly.

---

<a name="s2"></a>
## 2. MVC Pattern

### What is MVC, applied to an Express app?
**Model** — Mongoose schemas/data access. **View** — for an API, this is the JSON shape you return (or a templating engine, if server-rendered). **Controller** — request handlers that read the request, call services/models, and shape the response. The point is separation: business logic shouldn't live in route files, and data access shouldn't live in controllers.

### What does a typical Express MVC folder layout look like?
```
routes/     → maps URL + verb to a controller function
controllers/→ parses req, calls service, sends res — thin
services/   → business logic, orchestration
models/     → Mongoose schemas
middleware/ → auth, validation, error handling
```
Controllers stay thin on purpose — logic that lives in a controller can't be reused by a queue worker or a CLI script that needs the same operation.

### Where does validation belong in this layout?
At the edge, before the controller does real work — either dedicated middleware (`express-validator`, Joi/Zod schemas) or the top of the controller. Never inside the model as the only line of defence; Mongoose schema validation is a good backstop, but by the time it fires you've already done request parsing you might not have needed to.

### Why not just put everything in the route handler?
It works until it doesn't: the moment two routes need the same logic (a REST endpoint and a queue consumer both need to "create a user"), duplicated logic in route handlers diverges over time. A service layer is the one place that logic lives, called from wherever needed.

### Is MVC still meaningful for an API-only backend with no server-rendered views?
Yes, loosely — "View" becomes "the JSON contract," but the separation of concerns is still the point: read requests independent of business rules, business rules independent of storage. Many teams call it "controller-service-repository" instead of MVC to be precise about there being no view layer at all.

### How does MVC relate to the layers in a typical Node interview answer about "clean architecture"?
Same shape, more layers named explicitly: **Controller** (HTTP) → **Service** (business rules) → **Repository** (data access) → **Model** (schema). Each layer only talks to the one directly below it, and dependencies point inward — the repository doesn't know about Express, the service doesn't know about MongoDB specifics.

---

<a name="s3"></a>
## 3. Socket.IO & Real-Time

### What problem does Socket.IO solve that raw WebSockets don't?
Raw `ws` gives you a socket and nothing else. Socket.IO adds automatic reconnection, fallback transports for restrictive networks, room/namespace broadcasting, and acknowledgements (a client can await a server's response to an emitted event) — all things you'd otherwise hand-roll.

### How does a Socket.IO connection actually start?
It begins as an HTTP long-polling handshake, then upgrades to a WebSocket if the network allows it. That's why Socket.IO isn't wire-compatible with a plain WebSocket server — the client library and server library are a matched pair.

### What are rooms, and why do they matter for a chat feature?
A room is a server-side grouping of sockets (`socket.join('room:42')`) that lets you broadcast to a subset of connected clients (`io.to('room:42').emit(...)`) instead of every connection. For a chat app, each conversation is a room — join on entering, leave on exiting, broadcast only within it.

### How do you scale Socket.IO across multiple Node instances?
By default, `io.emit` only reaches sockets connected to *that* process — a client on instance B never hears an emit from instance A. Fix it with the **Redis adapter** (`@socket.io/redis-adapter`): every instance publishes emitted events to Redis pub/sub, and every instance's adapter subscribes and re-emits to its own local sockets. This is the direct reason the JD lists Redis next to Socket.IO — they're a standard pair.

### If you're behind a load balancer, what else do you need for Socket.IO to work?
**Sticky sessions** — the polling-to-WebSocket upgrade handshake needs every request from a given client to land on the same server instance during the handshake, or the balancer can route across processes that each hold half the state and the upgrade fails. Configure the LB (nginx, ALB) for IP-hash or cookie-based sticky routing.

### How do you authenticate a Socket.IO connection?
Pass a token in the handshake (`socket.handshake.auth.token`, or a query param) and verify it in a connection middleware (`io.use((socket, next) => {...})`) before allowing the connection through. Rejecting there is cheaper than accepting the connection and rejecting every message afterward.

### Socket.IO vs Server-Sent Events (SSE) vs plain polling — when would you pick each?
**Polling** — simplest, fine for low-frequency updates, wasteful at scale.
**SSE** — one-directional server→client push over plain HTTP, no library needed, auto-reconnects natively, but no client→server channel on the same connection.
**Socket.IO/WebSockets** — bidirectional, low-latency, needed for chat, live cursors, multiplayer — anything where the client also needs to push events, not just receive them.

### How do you handle a client disconnecting mid-operation (e.g. mid-typing-indicator)?
Listen for `socket.on('disconnect', ...)` server-side and clean up any room membership or presence state there — never rely on the client to send a graceful "goodbye" event, since network drops and tab closes don't give it the chance.

---

<a name="s4"></a>
## 4. Microservices — Deeper Dive

### What actually makes a service a "microservice" rather than just a small app?
Independent deployability and its own data store. If two services must be deployed together or share a database, they're not independently scalable or independently failable — you've built a distributed monolith with extra network hops.

### How do microservices in a Node stack usually talk to each other?
**Synchronous** — REST or gRPC, when the caller needs an immediate answer.
**Asynchronous** — a message broker (RabbitMQ, SQS, Kafka) or Redis pub/sub, when the caller just needs the work to happen eventually. Async is preferred wherever the caller doesn't need to block — it decouples the services' uptime from each other.

### What's the core trade-off of moving from a monolith to microservices?
You trade **implementation complexity** (one deploy, one process, easy local debugging, transactions are just DB transactions) for **operational complexity** (network calls that can fail, distributed tracing, eventual consistency, no cross-service transactions). It only pays off once a single team/deploy cadence for the whole system becomes the actual bottleneck — scaling a small team's throughput, not "because microservices are modern."

### How do you handle a transaction that spans two services (e.g. reserve inventory + charge payment)?
There's no distributed ACID transaction across two databases. Use the **Saga pattern**: each service does its local step and publishes an event; if a later step fails, compensating actions undo the earlier ones (release the inventory reservation if payment fails). Orchestrated (a coordinator drives each step) or choreographed (each service reacts to the previous service's event) are the two flavours.

### What is the outbox pattern, and why does it exist?
The problem: if a service writes to its DB and *then* publishes an event, a crash between those two steps loses the event — the DB says "done" but nothing downstream ever hears about it. The fix: write the event into an "outbox" table in the *same* local transaction as the business write, then a separate poller/CDC process reads the outbox and publishes to the broker. This guarantees the event is published if and only if the DB write committed.

### How do you prevent one failing service from cascading into a full outage?
**Circuit breaker** — after N consecutive failures calling a downstream service, stop calling it for a cooldown period and fail fast instead, so the caller isn't stuck waiting on timeouts to a service that's already down.
**Timeouts** on every outbound call — no request should be able to wait forever.
**Bulkheads** — isolate resource pools (connection pools, thread pools) per downstream dependency, so one slow dependency can't starve requests to a healthy one.

### How does service discovery work when instances scale up and down dynamically?
A registry (Consul, Eureka, or the platform's own — ECS service discovery, Kubernetes DNS) tracks which instances are currently healthy, and services look up "where is the `payments` service right now" instead of hardcoding an IP. Client-side (caller queries the registry) or server-side (a load balancer/gateway does the lookup) are the two models.

### What's an API Gateway's job in a microservices architecture?
Single entry point for external clients — routes to the right internal service, terminates auth/rate-limiting/TLS in one place instead of duplicating it per service, and can aggregate multiple internal calls into one response for the client (a BFF — backend-for-frontend).

### How do you debug a request that failed somewhere across five services?
**Distributed tracing** — a correlation/trace ID generated at the entry point and propagated through every downstream call (as a header), so every service's logs can be filtered to that one ID and lined up in order. Without it, you're grepping five separate log streams by timestamp and hoping.

---

<a name="s5"></a>
## 5. JWT — Deeper Dive

### Walk through a JWT's structure.
Three base64url segments joined by dots: **header** (algorithm + token type), **payload** (claims — `sub`, `exp`, custom data), **signature** (HMAC or RSA/ECDSA signature over header+payload, using a secret/private key). Note: the payload is only *encoded*, not encrypted — never put secrets in it, anyone can base64-decode and read it.

### How does the server verify a JWT is legitimate?
Recomputes the signature over the received header+payload using the same secret (HMAC) or the public key (RSA/ECDSA), and compares it to the signature in the token. Any change to the payload — even one bit — produces a different signature, so tampering is detectable without a DB lookup.

### Access token vs refresh token — why both?
**Access token** — short-lived (minutes), sent on every request, so a leaked one is only dangerous briefly.
**Refresh token** — long-lived, used only to mint new access tokens, stored more carefully (httpOnly cookie, sometimes rotated on each use). This limits the blast radius of a stolen access token without forcing the user to re-login every few minutes.

### Where should the client store a JWT, and why does it matter?
**httpOnly cookie** — inaccessible to JavaScript, so immune to XSS-based theft, but needs CSRF protection since the browser sends it automatically.
**localStorage** — accessible to any script running on the page, so any XSS vulnerability is a full token theft. This is why httpOnly cookies are the safer default for browser apps, despite needing extra CSRF handling.

### How do you revoke a JWT before it expires?
You technically can't invalidate a stateless JWT directly — the whole point is the server doesn't look anything up. Real options: keep an expiry short and accept the exposure window; maintain a denylist (in Redis, keyed by token ID `jti`) checked on each request, which reintroduces the statefulness JWTs were meant to avoid; or version/rotate the signing secret to invalidate everything at once (a blunt instrument).

### What's the risk in `{ algorithm: 'none' }` or algorithm confusion attacks?
If the server's verification code trusts the `alg` field in the token itself rather than pinning the expected algorithm, an attacker can craft a token with `alg: none` (no signature required) or switch RS256 to HS256 and sign it using the server's own *public* key as an HMAC secret (since the public key is, well, public). Always hardcode the expected algorithm on the verify call — never read it from the token.

### How do you handle JWT auth across microservices without every service hitting an auth DB?
Use asymmetric signing (RS256): the auth service holds the private key and issues tokens; every other service only needs the public key to verify, with no network call and no shared secret to distribute securely. This is a common reason JWTs specifically (over opaque session tokens) get chosen in a microservices context.

### Where do you put JWT verification in an Express + microservices setup?
Either in each service (middleware verifies before the route handler runs) or centrally at the API Gateway, which verifies once and forwards trusted user context (e.g. as a header) to internal services that then trust the gateway rather than re-verifying. The gateway approach is common when internal services are network-isolated and only reachable through it.

---

<a name="s6"></a>
## 6. REST, SOAP & API Design/Optimization

### REST vs SOAP — what's the actual difference?
**SOAP** is a strict protocol: XML-only payloads, a formal contract (WSDL), built-in standards for security/transactions (WS-Security). Heavier, but predictable and self-describing — still common in banking/enterprise integrations.
**REST** is an architectural style, not a protocol: works over plain HTTP, typically JSON, no enforced contract (OpenAPI/Swagger is convention, not requirement), lighter weight and the default for modern web/mobile APIs.

### What actually makes an API RESTful, beyond "uses HTTP verbs and JSON"?
Resource-oriented URLs (`/orders/123`, not `/getOrder?id=123`), correct verb semantics (GET is safe/idempotent, POST creates, PUT replaces, PATCH partially updates, DELETE removes), statelessness (no server-side session required between requests — auth travels with each request), and using status codes meaningfully (201 on create, 404 on missing, 409 on conflict) rather than always returning 200 with an error field in the body.

### How do you version a REST API without breaking existing clients?
URL versioning (`/v1/orders`) is the simplest and most visible; header versioning (`Accept: application/vnd.api.v2+json`) keeps URLs clean but is easy for clients to miss. Either way, the discipline that matters is: never change a field's meaning or remove a field in place — add a new version instead, and give existing clients a deprecation window.

### What's the difference between pagination approaches, and when do you use cursor over offset?
**Offset** (`?page=3&limit=20`) is simple but breaks under concurrent writes — insert a row on page 1 and everything downstream shifts, causing skipped or duplicated rows — and gets slower on deep pages since the DB still scans past all skipped rows.
**Cursor** (`?after=<lastId>`) uses a stable pointer (usually an indexed, sortable field) and stays O(1) regardless of depth, at the cost of not supporting "jump to page 7" directly. Cursor is the right default for any feed that's actively being written to while paginated.

### Name three concrete ways to optimize a slow API endpoint.
**N+1 fix** — batch-load related data (`populate`/`$lookup`/`JOIN`) instead of querying per item in a loop.
**Caching** — Redis in front of expensive/rarely-changing reads, with a clear invalidation rule.
**Field selection / pagination** — never return an entire collection or every field when the client used 3 of them; `.select()` in Mongoose, explicit field lists, cursor pagination on large lists.
Also worth naming: response compression (gzip), an index on whatever field the query filters/sorts by, and moving genuinely slow work (report generation, image processing) off the request path entirely into a queue.

### How do you design an idempotent POST (e.g. "create order" that a flaky client might retry)?
Accept an `Idempotency-Key` header from the client; on receipt, check if that key has already been processed (store the key → response in Redis with a TTL) and if so, return the cached result instead of creating a duplicate order. This is the standard pattern payment APIs (Stripe) use.

### What does HATEOAS mean, and do real APIs actually implement it?
Hypermedia As The Engine Of Application State — responses include links to the next valid actions (`"actions": {"cancel": "/orders/123/cancel"}`), so a client discovers the API's capabilities at runtime instead of hardcoding URLs. In practice, most "REST" APIs (including this JD's likely stack) skip it — it's the most-cited-least-implemented piece of Fielding's original REST definition. Know it exists; don't expect to build it.

### Rate limiting an API — what's the actual mechanism, and why Redis?
A sliding-window or token-bucket counter per client (by API key or IP), incremented on each request and checked against a limit, with a TTL so it resets. It has to live somewhere shared across all instances — in-memory counters reset per-process and let a client blow through the limit just by round-robining across instances — which is exactly the Redis dependency this JD lists.

---

<a name="s7"></a>
## 7. jQuery — Quick Refresh (legacy but explicitly listed)

### Why would a modern JD still list jQuery alongside React?
Realistically: legacy pages/widgets that predate the React migration, or a marketing/CMS-driven part of the site that never got rewritten. Expect it to come up as "can you maintain this," not "would you choose this for something new."

### `$(document).ready()` — what problem does it solve, and what's the modern equivalent?
Waits for the DOM to be fully parsed before running code that touches DOM elements, so a script in `<head>` doesn't fail trying to select an element that doesn't exist yet. Modern equivalent: a `<script defer>` tag, or just placing the script at the end of `<body>`, or `DOMContentLoaded` in vanilla JS.

### AJAX in jQuery vs `fetch` — what's the practical difference?
`$.ajax()` — callback-based (or a jQuery-flavoured promise via `.done()/.fail()`), auto-parses JSON, has broad legacy browser support.
`fetch` — native, real Promises, but doesn't reject on HTTP error status codes (a 404 still resolves — you must check `response.ok` yourself) and needs an explicit `.json()` call to parse the body.

### Why did the industry move away from jQuery for new frontend work?
Native DOM APIs (`querySelector`, `classList`, `fetch`) closed most of the gap jQuery existed to paper over cross-browser inconsistencies for. And for anything with real UI state, a component framework (React) manages DOM updates through a virtual DOM diff instead of imperative `.html()`/`.append()` calls scattered across the codebase, which stops scaling once a page has real interactivity.

---

<a name="s8"></a>
## 8. Flag: "Hibernate / JPA" in the skills list

This JD's skills list includes **Hibernate** and **JPA** — these are **Java ORM technologies** (Hibernate implements the JPA specification), unrelated to the Node.js/Express/Mongoose stack the rest of the JD describes. There's no Node equivalent to study for these by name; they almost certainly leaked into this JD from a shared/templated skills list used across both Java and Node postings at this company.

**What to actually do with this:** don't spend prep time on Hibernate/JPA specifics. If it comes up in a screening call, the honest and correct answer is that your ORM experience is Mongoose (MongoDB) — and if pressed on the *concept* of an ORM, you can speak to what an ORM does generically (mapping objects/documents to storage, migrations, N+1 query pitfalls — see [database/00-ROADMAP.md](../database/00-ROADMAP.md) Part 07 `populate`/N+1 on that last one, which is the same underlying problem Hibernate's lazy-loading N+1 issue is).

---

## 9-Section Study Order (given limited time)

1. **OOP & SOLID** (§1) — near-certain to come up as a "explain SOLID with an example" question at 3 YOE.
2. **Microservices deep dive** (§4) — the JD's responsibilities section leans heavily on this.
3. **JWT deep dive** (§5) — auth is almost always asked hands-on ("walk me through your auth flow").
4. **Socket.IO + Redis adapter** (§3) — listed as a must-have, likely to get a "how would you scale this" follow-up.
5. **REST/API optimization** (§6) — pairs with your existing [nodejs bank §24](QNA-INTERVIEW-BANK.md#s24) and §28 scenario questions.
6. **MVC** (§2) — quick, mostly a warm-up question.
7. **jQuery** (§7) — lowest yield, skim once.
8. Re-skim [database/00-ROADMAP.md](../database/00-ROADMAP.md) for MongoDB/Redis since both are explicit must-haves.
