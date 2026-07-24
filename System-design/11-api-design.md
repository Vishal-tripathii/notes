# System Design Study Notes — Part 11

## API Design (REST, Naming, Pagination, Versioning & GraphQL)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, worked User/Product API designs, and a full interview Q&A battery included.
>
> **Cross-links:** Part 2 (statelessness), Parts 5 & 5.5 (caching, rate limiting), Part 6 (auth headers), Part 7 (HTTPS), Part 10 (relationships → nested resources).

---

## Table of Contents

1. [Analogy + definition](#analogy)
2. [HTTP methods & status codes](#methods)
3. [The REST constraints](#constraints)
4. [Good API naming](#naming)
5. [Pagination, Filtering, Sorting, Versioning](#pfsv)
6. [Worked example: User & Product APIs](#worked)
7. [Things to add as the interviewer](#extras)
8. [Interview questions & answers](#interview)
9. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="analogy"></a>
# 1. Analogy + definition

## Analogy: the restaurant waiter 🍽️
You (the **client**) don't walk into the kitchen and cook — you talk to the **waiter** (the **API**). You order from the **menu** (a request), the waiter takes it to the kitchen (**server/database**), and brings back your food (the **response**). You don't need to know *how* the kitchen works — just what's on the menu and how to ask.

> **An API is the waiter + menu:** a well-defined contract that lets a client ask a server for things without knowing its internals.

## Definition
**An API (Application Programming Interface) is a contract defining how two software systems talk** — what requests you can make and what responses you'll get.

The most common web style is **REST (REpresentational State Transfer)** — conventions on top of HTTP. A **REST API** models everything as **resources** (users, products, orders) acted on by standard **HTTP methods**.

---

<a name="methods"></a>
# 2. HTTP methods & status codes

## HTTP methods (verbs)
| Method | Action | Example | Idempotent? |
|---|---|---|---|
| **GET** | Read | `GET /products` | ✅ Yes (safe) |
| **POST** | Create | `POST /products` | ❌ No |
| **PUT** | Replace (full update) | `PUT /products/123` | ✅ Yes |
| **PATCH** | Partial update | `PATCH /products/123` | ⚠️ Usually |
| **DELETE** | Remove | `DELETE /products/123` | ✅ Yes |

> **Idempotent** = doing it multiple times = same effect as once. `DELETE /products/123` ×5 → product gone either way. `POST /products` ×5 → **five products**. Matters for retries: retrying is safe *only* if idempotent.

## Status codes
| Range | Meaning | Common |
|---|---|---|
| **2xx** | Success | 200 OK, 201 Created, 204 No Content |
| **3xx** | Redirect | 301 Moved, 304 Not Modified (caching) |
| **4xx** | Client's fault | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 429 Too Many Requests |
| **5xx** | Server's fault | 500 Internal Error, 503 Service Unavailable |

> `401` = "I don't know who you are" (not authenticated). `403` = "I know you, but you're not allowed" (not authorized). `429` = rate-limited (Part 5.5).

---

<a name="constraints"></a>
# 3. The REST constraints (6)

1. **Client-Server separation** — UI and data evolve independently; share only the contract.
2. **Statelessness** — every request is self-contained; no session stored between requests. *(Part 2 — what makes horizontal scaling possible.)*
3. **Cacheability** — responses declare if cacheable (`Cache-Control` — Part 6). *(Part 5.)*
4. **Uniform Interface** — consistent, predictable conventions (resources + standard methods).
5. **Layered System** — client can't tell if it's hitting the real server or a load balancer/cache/gateway. *(Part 2.)*
6. **Code on Demand** (optional) — server can send executable code (rare).

> **Soundbite:** "REST is stateless, resource-based, uses standard HTTP methods and status codes — statelessness is what lets it scale horizontally."

---

<a name="naming"></a>
# 4. Good API naming

### 1. Use **nouns**, not verbs — the method IS the verb
```
❌ /getAllUsers   /createUser   /deleteUser
✅ GET /users     POST /users   DELETE /users/123
```

### 2. Use **plural** nouns for collections
```
✅ /users  /products  /orders     ❌ /user  /getProduct
```

### 3. Use **hierarchy/nesting** for relationships (Part 10)
```
GET /users/123/orders        → all orders for user 123
GET /users/123/orders/45     → order 45 of user 123
```

### 4. **lowercase + hyphens** (kebab-case), no trailing slash, no extensions
```
✅ /product-categories
❌ /productCategories  /product_categories  /products/  /products.json
```

### 5. Consistent & predictable
`/users/{id}` → `/products/{id}` too. Same pattern everywhere.

> **Rule:** a good URL reads like a noun phrase, the method supplies the verb. `DELETE /users/123/orders/45` = "delete order 45 of user 123."

---

<a name="pfsv"></a>
# 5. Pagination, Filtering, Sorting, Versioning

## Pagination — never return everything
**Offset-based** (simple, common):
```
GET /products?limit=20&offset=40      → items 41–60
GET /products?page=3&limit=20         → page 3
```
- ✅ Simple, jump to any page. ❌ Slow on huge datasets (DB skips offset rows); items shift if data changes.

**Cursor-based** (large / real-time feeds):
```
GET /products?limit=20&cursor=eyJpZCI6MTIzfQ
```
- ✅ Stable & fast on massive datasets (Instagram/Twitter). ❌ Only next/previous, no arbitrary page.

> "Offset for simple admin tables; cursor for large or real-time feeds."

## Filtering
```
GET /products?category=electronics&price_min=100&price_max=500&in_stock=true
```

## Sorting
```
GET /products?sort=price          → ascending
GET /products?sort=-price         → descending ("-" prefix)
GET /products?sort=price,-rating  → price asc, then rating desc
```

## Combined (real-world)
```
GET /products?category=electronics&price_min=100&sort=-rating&limit=20&page=2
```

## Versioning — evolve without breaking clients
**URI** (most common, explicit): `GET /v1/users` → `GET /v2/users`.
**Header** (cleaner URLs): `Accept: application/vnd.myapp.v2+json`.
> Version only for **breaking** changes; lets old clients (esp. mobile) keep working.

---

<a name="worked"></a>
# 6. Worked example: User & Product APIs

## User API
```
GET    /users               → list users (paginated, filterable)
POST   /users               → create a user
GET    /users/{id}          → get one user
PUT    /users/{id}          → replace a user (full update)
PATCH  /users/{id}          → partial update (e.g. just email)
DELETE /users/{id}          → delete a user
GET    /users/{id}/orders   → a user's orders (nested = one-to-many)
```
**Create a user:**
```
POST /users
Body: { "name": "Alice", "email": "alice@mail.com" }

201 Created
{ "id": 123, "name": "Alice", "email": "alice@mail.com", "createdAt": "..." }
```
**List with pagination + filter + sort:**
```
GET /users?role=admin&sort=-createdAt&limit=20&page=1

200 OK
{
  "data": [ {...}, {...} ],
  "pagination": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 }
}
```

## Product API
```
GET    /products                    → list (paginate/filter/sort)
POST   /products                    → create
GET    /products/{id}               → get one
PUT    /products/{id}               → replace
PATCH  /products/{id}               → partial update (e.g. price)
DELETE /products/{id}               → delete
GET    /products/{id}/reviews       → reviews (one-to-many)
POST   /products/{id}/reviews       → add a review
GET    /categories/{id}/products    → products in a category
```
**Search products:**
```
GET /products?category=electronics&price_min=100&sort=-rating&limit=20

200 OK
{
  "data": [ { "id": 1, "name": "Laptop", "price": 999, "rating": 4.5 }, ... ],
  "pagination": { "limit": 20, "cursor": "next_page_token" }
}
```

> Consistent patterns, plural nouns, nesting for relationships, methods as verbs, standard status codes, pagination baked in — exactly what interviewers score.

---

<a name="extras"></a>
# 7. Things to add as the interviewer 🎤

Mention these *proactively* — they separate good from great:

1. **Consistent error responses** — structured body, not just a code:
```
400 Bad Request
{ "error": { "code": "INVALID_EMAIL", "message": "Email format is invalid", "field": "email" } }
```
2. **Auth & authorization** — JWT in `Authorization: Bearer` (Part 6) over HTTPS (Part 7). `401` = identity, `403` = permission.
3. **Rate limiting** — `429` when exceeded (Redis INCR + TTL, Part 5.5); headers like `X-RateLimit-Remaining`.
4. **Idempotency for safe retries** — `POST` (payments) supports an **idempotency key** so retries don't double-charge.
5. **HTTPS always, validate all input, don't leak internals** — never expose stack traces / DB errors.
6. **Caching headers** — `Cache-Control` / `ETag` for clients & CDNs (Parts 5 & 6).
7. **HATEOAS** (bonus) — responses include links to related actions (`"links": {...}`).

> **Meta-point:** a great answer = endpoints **+ auth + errors + pagination + versioning + rate limiting + security**. Mentioning these unprompted earns the top score.

---

<a name="interview"></a>
# 8. Interview questions & answers

### Q: "What makes an API RESTful?"
> *"REST is a set of conventions on top of HTTP. It's resource-based — everything is a noun like /users — and you act on resources with standard HTTP methods: GET to read, POST to create, PUT and PATCH to update, DELETE to remove. It's stateless, so each request carries everything the server needs and no session is stored between requests, which is what lets it scale horizontally. It also uses standard status codes and is cacheable and layered."*

### Q: "GET vs POST vs PUT vs PATCH?"
> *"GET reads data and is safe and idempotent. POST creates a new resource and is not idempotent — calling it twice creates two resources. PUT replaces a resource entirely and is idempotent. PATCH updates part of a resource. Idempotency matters for retries: I can safely retry a GET, PUT, or DELETE after a network failure, but retrying a POST risks duplicates, which is why payment APIs use idempotency keys."*

### Q: "Why use nouns instead of verbs in endpoints?"
> *"Because the HTTP method already provides the verb. Instead of /getUser and /deleteUser, I use GET /users/123 and DELETE /users/123. The URL names the resource, the method is the action. It keeps the API consistent and predictable."*

### Q: "How would you handle returning a million records?"
> *"Pagination — I'd never return them all. For a simple case, offset-based with limit and page. For large or real-time datasets, cursor-based, because offset gets slow on huge tables and items shift between pages. I'd also support filtering and sorting via query params."*

### Q: "Design an API to get all orders for a user."
> *"I'd nest it under the user to express the one-to-many relationship: GET /users/{id}/orders, with pagination, filtering, and sorting — e.g. GET /users/123/orders?status=shipped&sort=-createdAt&limit=20. Returns 200 with a data array and pagination object, 404 if the user doesn't exist, 401 if not authenticated."*

### Q: "401 vs 403?"
> *"401 Unauthorized means the server doesn't know who you are — not authenticated, like a missing or invalid token. 403 Forbidden means it knows who you are but you lack permission. Authentication first, then authorization."*

---

### Q: "How would you prevent an API from being abused?"
> *"Multiple layers. First, rate limiting — cap requests per user or API key, say 100/minute, return 429 when exceeded; I'd implement it with Redis using atomic INCR and a TTL, and expose headers like X-RateLimit-Remaining. Second, authentication and authorization — require a valid token (JWT) so I know who's calling and can revoke abusers. Third, input validation — sanitize every input to block injection and malformed payloads. Fourth, HTTPS everywhere. Beyond that: throttling/quotas per tier, pagination limits so nobody requests a million records, a WAF or API gateway in front, and monitoring for abnormal patterns. So rate limiting + auth + validation, layered."*

**Layers:** rate limiting (429/Redis) → auth (JWT) → input validation → HTTPS → quotas/gateway → monitoring.

### Q: "How do you version a REST API?"
> *"Most commonly URI versioning — the version in the path, like /v1/users and /v2/users. It's explicit and easy to test, and lets old clients stay on v1 while I ship v2. The alternative is header versioning, e.g. Accept: application/vnd.myapp.v2+json — cleaner URLs but less visible. There's also ?version=2, less common. I default to URI versioning. The why matters: once public — especially with mobile apps I can't force-update — a breaking change would break existing clients, so versioning lets the API evolve safely. I only bump the version for breaking changes; backward-compatible additions don't need one."*

### Q: "REST vs GraphQL — when would you choose each?"
Core difference: **REST** = multiple endpoints, each a fixed shape. **GraphQL** = a single endpoint where the *client* specifies exactly the data it wants (incl. nested) in one query.
Two problems GraphQL solves: **over-fetching** (REST returns the whole object) and **under-fetching / N+1** (REST needs multiple round trips for nested data).
> *"REST uses multiple endpoints that each return a fixed shape; GraphQL exposes a single endpoint where the client asks for exactly the fields it needs, including nested data, in one request. I'd choose GraphQL when clients have varied, complex data needs — a mobile app minimizing round trips and avoiding over-fetching, or a dashboard pulling many related resources at once. I'd choose REST when I want simplicity, strong HTTP caching, and standard tooling — REST caches beautifully because each endpoint is a cacheable URL, whereas GraphQL's single POST endpoint makes HTTP caching harder. REST is also easier to secure and rate-limit per endpoint. So: REST for simple, cacheable, resource-based APIs; GraphQL for flexible, data-rich clients. Many systems use both."*

| | REST | GraphQL |
|---|---|---|
| Endpoints | Many (per resource) | One |
| Data shape | Fixed by server | Chosen by client |
| Over/under-fetching | Common | Solved |
| Caching | Easy (HTTP/URL) | Harder |
| Best for | Simple, cacheable APIs | Complex, varied data needs |

### Q: "How would you design pagination for a social media feed?"
> *"Cursor-based, not offset-based. A feed is huge and constantly changing — new posts arrive while you scroll — and with offset pagination, new posts shifting everything down cause you to see duplicates or skip posts between page loads, and deep offsets get slow because the DB skips all preceding rows. A cursor fixes both: it's a pointer to the last item you saw — an encoded post ID or timestamp — and the next request says 'give me 20 items after this cursor.' Response is data plus a nextCursor token, which the client sends back for the next batch. It's stable against inserts, and fast because the DB seeks directly to the cursor via an index instead of counting past a huge offset. Trade-off: only next/previous, no arbitrary page — but a feed only scrolls forward, so that's fine. This is how Twitter and Instagram feeds work."*
```
GET /feed?limit=20                     → first batch + "nextCursor": "abc123"
GET /feed?limit=20&cursor=abc123       → next 20 after that point
```
**Points:** cursor (not offset) → stable against new inserts (no dupes/skips) + fast (index seek) → feeds only scroll forward.

### Q: "What does idempotent mean, and why does it matter?"
> *"An operation is idempotent if performing it multiple times has the same effect as once. GET, PUT, and DELETE are idempotent — deleting user 123 five times leaves the same end state. POST is not — 'create order' five times creates five orders. Why it matters: network failures and retries. If a request times out, the client doesn't know if it succeeded, so it retries. If the operation is idempotent, retrying is safe. If not — like a POST that charges a card — a retry could double-charge. That's why critical POSTs use an idempotency key: the client sends a unique key, the server remembers it, so a duplicate request is processed only once and returns the original result. Idempotency is about making a distributed system safe to retry."*
**Points:** same result no matter how many calls → GET/PUT/DELETE yes, POST no → matters for safe retries → payments use idempotency keys.

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet — everything on one page

### Core
- **API** = contract (waiter + menu) between client & server.
- **REST** = resources (nouns) + HTTP methods + status codes; **stateless** (→ scales).

### Methods & idempotency
| Method | Action | Idempotent |
|---|---|---|
| GET | Read | ✅ |
| POST | Create | ❌ |
| PUT | Replace | ✅ |
| PATCH | Partial update | ⚠️ |
| DELETE | Remove | ✅ |
- **Idempotent** = same result however many calls. Safe to retry only if idempotent. POST → use idempotency key.

### Status codes
2xx OK (200/201/204) · 3xx (301/304) · 4xx client (400/401/403/404/409/429) · 5xx server (500/503).
- 401 = not authenticated · 403 = not authorized · 429 = rate-limited.

### REST constraints
Client-server · **stateless** · cacheable · uniform interface · layered · code-on-demand (opt).

### Naming
- Nouns not verbs (method = verb) · plural (`/users`) · nest for relationships (`/users/1/orders`) · kebab-case · consistent.

### Pagination / filter / sort / version
- **Offset** (`?page=2&limit=20`) — simple, jump anywhere; slow/shifts at scale.
- **Cursor** (`?cursor=abc`) — stable + fast for feeds; next/prev only.
- **Filter** `?category=x&price_min=100` · **Sort** `?sort=-price` · **Version** `/v1/` (breaking changes only).

### REST vs GraphQL
- REST = many endpoints, fixed shape, easy caching → simple/cacheable APIs.
- GraphQL = one endpoint, client picks fields, solves over/under-fetching → complex/varied clients; caching harder.

### Production extras (mention unprompted)
Structured errors · auth (JWT + HTTPS) · rate limiting (429/Redis) · idempotency keys · input validation · caching headers · HATEOAS.

### Design pattern (User/Product)
`GET/POST /users` · `GET/PUT/PATCH/DELETE /users/{id}` · `GET /users/{id}/orders` — consistent, plural, nested, paginated.

### Connects to
- Part 2: statelessness. · Parts 5 & 5.5: caching, rate limiting. · Part 6: auth headers. · Part 7: HTTPS. · Part 10: relationships → nested resources.

### Suggested next topics
- **Message queues** (async, decoupling, spikes).
- **Load balancing in depth**.
- **Full system design walkthrough** (URL shortener / Instagram — ties all parts together).

*— End of Part 11 —*
