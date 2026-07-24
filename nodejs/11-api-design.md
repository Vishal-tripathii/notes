# Node.js Study Notes — Part 11

## API Design — REST, Versioning, Idempotency, Error Contracts

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.
>
> **Concepts elsewhere:** [11-api-design](../11-api-design.md) (system design) · pagination in [Part 9 §3](09-performance.md) · rate limiting in [Part 6 §10](06-http-and-express.md) and [Part 7](07-authentication-and-security.md). **This part goes deep on idempotency, error contracts, and designing a real API** — where the interview actually lives.

---

## Table of Contents

1. [REST — resources, not actions](#rest)
2. [Versioning](#versioning)
3. [Filtering & Sorting](#filtering)
4. [Pagination — the contract layer](#pagination)
5. [Idempotency](#idempotency) ⭐
6. [Rate limiting — the contract layer](#ratelimit)
7. [Error contracts](#errors) ⭐
8. [Interview Questions & Answers](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="rest"></a>
# 1. REST — resources, not actions

**URLs are nouns, HTTP methods are the verbs.**

```
❌ POST /getUser?id=42          ❌ POST /createOrder
❌ POST /updateUserEmail        ❌ POST /deleteOrder

✅ GET    /users/42             ✅ POST   /orders
✅ PATCH  /users/42             ✅ DELETE /orders/42
```

| Method | Meaning | Safe | Idempotent |
|---|---|---|---|
| `GET` | read | ✅ | ✅ |
| `POST` | create / action | ❌ | ❌ ⚠️ |
| `PUT` | full replace | ❌ | ✅ |
| `PATCH` | partial update | ❌ | 🟡 depends |
| `DELETE` | remove | ❌ | ✅ |

**Safe** = changes nothing. **Idempotent** = doing it five times leaves the same state as doing it once. That last column is the entire basis of §5.

## When *not* to be RESTful

Some operations genuinely aren't CRUD, and forcing them into resources produces a worse API:

```js
POST  /orders/42/cancel                     // ✅ clear, atomic, auditable
PATCH /orders/42 { status: 'cancelled' }    // ❌ implies any status is settable
```

**Why the verb wins:** cancelling isn't "setting a field" — it refunds payment, releases inventory, sends an email, and is only legal from certain states. Exposing `status` as writable invites `PATCH { status: 'delivered' }`, skipping your entire workflow.

> ⭐ **Rule: model state transitions as actions, not writable fields.** `/publish`, `/cancel`, `/refund`, `/retry`.

---

<a name="versioning"></a>
# 2. Versioning

```
/v1/orders                            ← URL path      ⭐ use this
Accept: application/vnd.api.v1+json   ← header        "purer", harder to test
?version=1                            ← query param   easy to lose
X-API-Version: 1                      ← custom header non-standard
```

**Use the URL path.** Greppable, cacheable, testable in a browser, obvious in logs. Academic purity loses to operational clarity.

## ⭐ The better answer: don't version — avoid breaking changes

Every version you ship is one you maintain forever. Classify first:

```
NON-breaking (no new version):
  • adding a response field       ← clients must ignore unknown fields
  • adding an OPTIONAL request field
  • adding a new endpoint

BREAKING (needs a version):
  • removing or renaming a field
  • changing a type (string → number)
  • adding a REQUIRED request field
  • changing status codes or error shapes
```

**Expand–contract** handles most "breaking" changes without a version bump:
```
1. EXPAND    add the new field alongside the old, populate both
2. MIGRATE   update clients, monitor usage of the old field
3. CONTRACT  remove the old field once usage hits zero
```

> **When you must version, version the smallest unit possible** — one endpoint beats the whole API. Publish a deprecation policy: `Sunset` header, 6–12 months' notice, and real usage metrics so you know who's still on it.

---

<a name="filtering"></a>
# 3. Filtering & Sorting

```
GET /orders?status=paid&minTotal=100&sort=-createdAt&limit=20&fields=id,total
```

```
?status=paid              exact match
?status=paid,shipped      IN (comma-separated)
?minTotal=100             range — explicit names beat operator syntax
?sort=-createdAt,total    "-" = descending, comma = tiebreakers
?fields=id,total          sparse fieldsets — smaller payloads
?q=laptop                 full-text search
```

## ⚠️ The security part everyone forgets: whitelist both

```js
Order.find(filter).sort(req.query.sort);   // ❌ SORT INJECTION
Order.find(req.query);                     // ❌ FILTER INJECTION
```

Two distinct problems:
1. **Performance** — a client sorts on an unindexed field and forces a full collection scan on demand. **A DoS anyone can trigger from a browser.**
2. **Data exposure** — filtering on fields you never meant to expose (`?passwordHash[$exists]=true`) leaks information, and in Mongo it's [NoSQL injection](07-authentication-and-security.md).

```js
const SORTABLE   = ['createdAt', 'total', 'status'];
const FILTERABLE = ['status', 'userId'];

const sort   = SORTABLE.includes(field) ? { [field]: dir } : { createdAt: -1 };
const filter = pick(req.query, FILTERABLE);      // ⭐ allowlist, never pass-through
```

> **Every sortable field needs an index** ([Part 8](08-mongodb-and-mongoose.md)). If you can't index it, it isn't sortable — a product decision, not a technical one.

---

<a name="pagination"></a>
# 4. Pagination — the contract layer

Mechanics in [Part 9 §3](09-performance.md). The contract:

```json
{
  "data": [ ... ],
  "pagination": { "nextCursor": "eyJpZCI6IjY1YTBmIn0=", "hasMore": true }
}
```

1. **Always paginate list endpoints** — even ones that "only ever return a few". That assumption dies in production.
2. **Cap `limit` server-side.** `?limit=1000000` must not work. Default 20, max 100.
3. **Make the cursor opaque** — base64 an internal structure. If clients see `?cursor=1234` they'll construct their own, and you can never change the scheme.

---

<a name="idempotency"></a>
# 5. ⭐ Idempotency

**An endpoint is idempotent if calling it N times leaves the system in the same state as calling it once.**

The problem it solves is unavoidable: **the network can't tell you whether the request failed or the *response* was lost.**

```
Client                              Server
  │ POST /orders  ────────────────▶ │ order created ✅, payment charged ✅
  │                    ╳ timeout    │ response lost in transit
  │ retry? ──────────────────────── │ ⚠️ retry = a SECOND order, charged twice
```

The client cannot distinguish "never arrived" from "arrived, response lost." **Retrying is correct behavior — so the server must make retries safe.**

## Which methods are naturally idempotent

```js
GET    /orders/42                      ✅ reading changes nothing
PUT    /orders/42 { total: 100 }       ✅ full replace → same result every time
DELETE /orders/42                      ✅ after the first, it stays deleted
POST   /orders                         ❌ each call creates a NEW order
PATCH  /orders/42 { $inc: {qty: 1} }   ❌ a delta — different every time
```

> ⭐ **`PATCH` is the subtle one.** `{ status: 'paid' }` is a **set** → idempotent. `{ $inc: { qty: 1 } }` is a **delta** → not. **Setting is idempotent; incrementing isn't.**

## Idempotency keys — the fix for POST

The client generates a unique key; the server remembers what it did with it.

```
POST /orders
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

```js
async function createOrder(req, res) {
  const key = req.headers['idempotency-key'];
  if (!key) return res.status(400).json({ error: 'Idempotency-Key required' });

  // ① claim the key ATOMICALLY — NX = "only if it doesn't exist"
  const claimed = await redis.set(`idem:${key}`, 'processing', 'NX', 'EX', 86400);

  if (!claimed) {
    const prior = await redis.get(`idem:${key}`);
    if (prior === 'processing') {
      return res.status(409).json({ error: 'Request in progress' });   // ② in-flight retry
    }
    return res.status(200).json(JSON.parse(prior));                    // ③ replay the response
  }

  const order = await Order.create(req.body);                          // ④ do the work ONCE
  await redis.setex(`idem:${key}`, 86400, JSON.stringify(order));      // ⑤ remember the result
  res.status(201).json(order);
}
```

**Four details that make it actually correct:**

**① Claim atomically with `SET NX`.** A naive `if (exists) … else …` races — two simultaneous retries both see "not found" and both create an order. `NX` makes check-and-claim one operation.

**② Handle the in-flight case** — a retry arriving while the original is still processing gets `409`, not a duplicate.

**③ Store the response, not just a flag** — the retry must receive the *same* result: same order ID, same status.

**④ TTL ~24 hours** — long enough for realistic retries, short enough not to store keys forever.

> **Where it matters most: payments, order creation, sending money — anything with an external side effect.** Stripe requires an idempotency key on every charge for exactly this reason.

**Related but simpler:** a **unique constraint** on a natural business key (`orderNumber`, `email`) prevents duplicates with no key management. Use it when one exists; idempotency keys are for when it doesn't.

---

<a name="ratelimit"></a>
# 6. Rate limiting — the contract layer

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735689600
```

> ⭐ **Return the headers on *every* response, not just on 429.** That's what lets a well-behaved client slow down *before* being blocked. An API that only signals at rejection guarantees clients hit the wall.

**Tier the limits — it's not one number:**
```
unauthenticated    →  10 req/min per IP
authenticated      → 100 req/min per user
login endpoint     →   5 req/15min       ⭐ brute force
expensive reports  →  10 req/hour
```

---

<a name="errors"></a>
# 7. ⭐ Error Contracts

**Every error, from every endpoint, gets the same shape.** Clients write one error handler, not thirty.

```json
{
  "error": {
    "code": "INSUFFICIENT_INVENTORY",
    "message": "Only 2 units of SKU-123 remain",
    "details": [ { "field": "items[0].quantity", "requested": 5, "available": 2 } ],
    "requestId": "req_8f3k2l"
  }
}
```

| Field | For | Rule |
|---|---|---|
| `code` | **machines** | stable, never changes — clients branch on it |
| `message` | **humans** | may change freely, may be localized |
| `details` | **forms** | field-level validation errors |
| `requestId` | **support** | ties a user's screenshot to your logs ⭐ |

> ⭐ **`code` is the contract; `message` is not.** If a client is regex-matching your `message`, you failed to give them a `code`. Codes let you reword messages without breaking anyone.

## Status codes that matter
```
200 OK          201 Created (+ Location)      204 No Content (delete)
400 malformed   401 not authenticated         403 authenticated, not allowed
404 not found   409 conflict (dup/bad state)  422 valid shape, invalid data
429 rate limited
500 our bug     503 down/shutting down (+ Retry-After)
```

**The three most-confused:**
- **401 vs 403** — 401 = *"I don't know who you are"* (log in). 403 = *"I know exactly who you are, and no"* (don't retry with the same credentials).
- **400 vs 422** — 400 is malformed JSON. 422 is well-formed JSON breaking a business rule.
- **404 vs 403 for private resources** — returning 403 for a record you don't own **confirms it exists**. For sensitive data, return **404** and leak nothing.

**Never leak internals:**
```js
res.status(500).json({ error: err.message });      // ❌ "ECONNREFUSED 10.0.1.5:5432"
res.status(500).json({ error: { code: 'INTERNAL_ERROR', requestId } });   // ✅
```

---

<a name="interview"></a>
# 8. Interview Questions & Answers

### Q1. Design an Orders API.
**Structure the answer: resources → lifecycle → endpoints → the hard parts.**

> **① Lifecycle first.** An order isn't a CRUD row, it's a **state machine**:
> ```
> pending → paid → shipped → delivered
>    └──────┴──▶ cancelled          (only from pending or paid)
> ```
> That constraint drives the whole design — you can't cancel a delivered order, and states never move backwards.
>
> **② The endpoints:**
> ```
> POST   /v1/orders                  create     (Idempotency-Key required ⭐)
> GET    /v1/orders?status=&cursor=  list       (cursor paginated)
> GET    /v1/orders/{id}             fetch one
> PATCH  /v1/orders/{id}             edit       (only while pending)
> POST   /v1/orders/{id}/cancel      ⭐ action, not a status PATCH
> POST   /v1/orders/{id}/refund      ⭐ action
> GET    /v1/orders/{id}/items       sub-resource
> ```
>
> **③ Why actions, not `PATCH {status}`:** cancelling refunds payment, releases inventory and emails the customer — a workflow with legality rules, not a field assignment. A writable `status` invites clients to skip the whole thing.
>
> **④ Creation is the hard part** — it charges money, so it must be idempotent. `Idempotency-Key` claimed atomically in Redis with a 24h TTL, storing the response so a retry replays the identical order. Without it, a mobile client on a flaky network double-charges customers.
>
> **⑤ Consistency:** creating an order touches inventory, payment and the order record. In one database that's a transaction; across services it's a **saga** with compensating actions — refund if shipping fails ([13-message-queues](../13-message-queues.md), [14-event-driven](../14-event-driven-architecture.md)).
>
> **⑥ Reads:** cursor pagination (order lists grow forever), allowlisted filters and sorts each backed by an index, and an extended reference storing `{userId, name}` on the order so a list render needs no join ([Part 8](08-mongodb-and-mongoose.md)).
>
> **⑦ The rest:** one error envelope with stable codes; tiered rate limits with headers on every response; `/v1` in the path; and **webhooks** for status changes, since polling until an order ships wastes both sides' resources.
>
> **⑧ Trade-offs I'd flag:** eventual consistency between order and inventory; whether cancellation is synchronous or queued; and that the **client** must generate the idempotency key — a server-generated one can't survive the retry."

### Q2. What makes an endpoint idempotent?
> "Calling it N times leaves the system in the same state as calling it once. **That's about *state*, not the response** — `DELETE` returning 204 then 404 is still idempotent, because the resource is gone either way.
>
> `GET`, `PUT`, `DELETE` are idempotent by definition; `POST` isn't. `PATCH` depends on the payload: `{status:'paid'}` is a set and is idempotent; `{$inc:{qty:1}}` is a delta and isn't.
>
> **It matters because the network can't distinguish a failed request from a lost response.** The client must retry, so the server has to make retries safe. For `POST` that means an **`Idempotency-Key`**: claim it atomically with `SET NX` — a plain check-then-act races — do the work once, store the response with a 24h TTL, replay it on retry, and return `409` while the original is still in flight.
>
> If a natural unique key exists — order number, email — a **unique constraint** achieves the same with less machinery."

### Q3. Cursor vs offset pagination?
> "**Offset** uses `skip(n)`, so the database walks and discards every skipped row — cost grows linearly with depth. Page 50,000 means skipping a million rows: seconds per request. It's also **incorrect under concurrent writes** — an insert shifts everything down, so users see duplicates or miss records between pages.
>
> **Cursor** asks for 'the next 20 after this ID' — an index seek, so **constant time at any depth**, and stable under writes because the cursor is a position in the data, not a count.
>
> The trade-off: cursors can't jump to an arbitrary page and can't give a total count. So **offset for admin tables** with page numbers over small datasets; **cursor for feeds, infinite scroll and public APIs**.
>
> Two implementation details: a non-unique sort field needs `_id` as a **tiebreaker** or you skip rows at page boundaries; and the cursor must be **opaque**, or clients construct their own and you can never change the scheme."

### Q4. `PUT` vs `PATCH`?
> "`PUT` replaces the entire resource — omitted fields are cleared, which is why it's idempotent. `PATCH` is a partial update. Most real APIs want `PATCH`, because clients rarely hold the complete resource and a `PUT` with a stale copy silently wipes fields another client just changed. If you offer `PUT`, be genuine about replace semantics rather than treating it as a partial update by another name."

### Q5. How do you handle a long-running operation in a REST API?
> "Don't block the request. Return **`202 Accepted`** with a job resource — `{ jobId, status: 'processing' }` plus a `Location` header to `/jobs/{id}`. The client polls that, or better, you send a **webhook** on completion. Same reasoning as pushing work to a queue in [Part 1.2](01.2-event-loop-blocking-and-real-world-load.md) — a 30-second HTTP request is a timeout waiting to happen and holds resources on both ends."

### Q6. Should you return the created object from `POST`?
> "Yes — `201` with the full object and a `Location` header. It saves the client an immediate `GET`, and it's the only way they learn server-generated values: ID, timestamps, computed totals. Returning a bare `{id}` forces a round trip for data you already had in memory."

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

### REST
```
URLs = NOUNS · methods = VERBS
GET safe+idempotent · PUT/DELETE idempotent · POST NOT · PATCH depends

⭐ state transitions = ACTIONS, not writable fields
   POST /orders/42/cancel   ✅
   PATCH /orders/42 {status} ❌ (skips the workflow)
```

### Versioning
```
/v1/orders in the PATH ⭐ (greppable, cacheable, obvious in logs)

non-breaking: add a response field · add OPTIONAL request field · new endpoint
BREAKING:     remove/rename · change type · add REQUIRED field · change errors

⭐ EXPAND → MIGRATE → CONTRACT avoids most version bumps
version the SMALLEST unit · Sunset header · 6-12mo notice
```

### Filtering / sorting
```
?status=paid,shipped · ?minTotal=100 · ?sort=-createdAt · ?fields=id,total

⚠️ ALLOWLIST both — never pass req.query to the DB
   sort injection  → unindexed sort = a DoS from a browser
   filter injection→ data exposure + NoSQL injection
every sortable field NEEDS an index
```

### Idempotency ⭐
```
N calls == 1 call, in terms of STATE (not the response)

natural: GET · PUT · DELETE          not: POST
PATCH: {status:'paid'} ✅ set  ·  {$inc:{qty:1}} ❌ delta

⭐ WHY: the network can't tell "failed" from "response lost" → clients MUST retry

Idempotency-Key (client-generated):
   ① SET NX to claim ATOMICALLY  (check-then-act RACES)
   ② 409 if still 'processing'
   ③ store the RESPONSE, replay it on retry
   ④ 24h TTL
alternative: a unique constraint on a natural business key
```

### Error contract
```json
{ "error": { "code":"...", "message":"...", "details":[], "requestId":"..." } }
```
```
code      → MACHINES, stable, the contract
message   → humans, may change/localize
requestId → ties a user screenshot to your logs ⭐

401 don't know you · 403 know you, no · 400 malformed · 422 invalid data
409 conflict · 429 limited · 201 + Location · 202 + job · 204 delete

⚠️ 403 on a record you don't own CONFIRMS it exists → return 404
⚠️ never return err.message (leaks host/schema)
```

### Rate limit headers
```
X-RateLimit-Limit / -Remaining / -Reset on EVERY response ⭐ (not just 429)
429 + Retry-After
tiers: anon 10/min · auth 100/min · login 5/15min · reports 10/hr
```

### Pagination contract
```
always paginate lists · cap limit server-side (default 20, max 100)
cursor must be OPAQUE (base64) or clients construct their own
```

---

*— Part 11 of the Node.js notes. Related: [Part 6 — Express](06-http-and-express.md) · [Part 8 — MongoDB](08-mongodb-and-mongoose.md) · [Part 9 — Performance](09-performance.md) · [11-api-design](../11-api-design.md) —*
