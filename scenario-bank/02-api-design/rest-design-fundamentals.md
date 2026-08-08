# REST Design Fundamentals — Scenario Bank

> Deeper reference notes on naming, methods, and worked examples already exist in [`System-design/11-api-design.md`](../../System-design/11-api-design.md). These entries focus on the reasoning/trade-off angle and cross-link there rather than repeating it.

---

### "How would you design a REST API?"

The core idea: everything is a **noun** (a resource — `/users`, `/orders`), and the **verb** comes from the HTTP method (`GET` read, `POST` create, `PUT`/`PATCH` update, `DELETE` remove), not from the URL itself. So instead of `/getUser` or `/deleteOrder`, you get `GET /users/123` and `DELETE /orders/45`.

Beyond the basic shape, a design that actually holds up in production also needs: consistent plural naming, pagination on every list endpoint (never return an unbounded collection), structured error responses, versioning for breaking changes, and auth on everything that isn't explicitly public. See the full worked example in [`System-design/11-api-design.md`](../../System-design/11-api-design.md#worked).

**Interview line:** *"REST models everything as resources acted on by standard HTTP methods — nouns in the URL, the verb comes from the method. Past the basics, what separates a good REST API is pagination, structured errors, versioning, and auth built in from the start, not bolted on later."*

**Tests:** REST fundamentals, resource modeling

*Axis: normal · Source: challenge question*

---

### "PUT vs PATCH? POST vs PUT?"

**POST** creates a new resource — you don't know its final URL yet, the server assigns it (`POST /orders` → server returns `201 Created` with `/orders/456`). Calling it twice creates two resources — not idempotent.

**PUT** replaces a resource **entirely** at a URL you already know — you send the full representation, and it fully overwrites whatever was there (or creates it at that exact URL if it didn't exist). Calling it twice with the same body is safe — same end state both times — idempotent.

**PATCH** updates **part** of a resource — you send only the fields that changed. It's *usually* idempotent (`PATCH {status: "shipped"}` twice = same result) but not always (`PATCH {increment: 1}` twice ≠ same result) — the idempotency depends on whether the patch describes an absolute value or a relative change.

```
POST /orders          → creates a new order, server picks the ID
PUT  /orders/123       → replaces order 123 entirely
PATCH /orders/123      → updates just the fields you send, e.g. { "status": "shipped" }
```

**Interview line:** *"POST creates and isn't idempotent — call it twice, get two resources. PUT replaces the whole resource at a known URL and is idempotent. PATCH updates part of it and is usually idempotent, unless the patch itself is a relative change like 'increment by one,' where repeating it isn't safe."*

**Tests:** HTTP method semantics, idempotency

*Axis: normal · Source: challenge question*

---

### "When should an API return 202 Accepted?"

`200 OK` and `201 Created` both mean "this is done, here's the result." `202 Accepted` means something different: **"I've accepted this request, but the work isn't finished yet — it's happening asynchronously."** You use it when a request kicks off something that takes real time — video processing, a bulk data export, sending a large batch of emails — and you don't want the client sitting there holding a connection open until it's done.

The response usually includes a way for the client to check progress: a status URL to poll, or nothing at all if the result will be delivered another way (webhook, email).

```
POST /videos/123/process
202 Accepted
{ "status": "processing", "statusUrl": "/jobs/abc123" }

GET /jobs/abc123
200 OK
{ "status": "completed", "resultUrl": "/videos/123/download" }
```

**Interview line:** *"202 means 'accepted, but not done yet' — for work that's genuinely asynchronous, like video processing or a bulk export. I return it with a status URL the client can poll, instead of holding the connection open until the work finishes."*

**Tests:** async API design, status codes

*Axis: normal · Source: challenge question*

---

### "How do you version APIs? URI versioning vs header versioning?"

You version an API so that a **breaking change** doesn't break clients you can't force to update immediately — think a mobile app whose users haven't updated yet. Non-breaking, additive changes (a new optional field) don't need a version bump at all.

**URI versioning** (`/v1/users` → `/v2/users`) — explicit, visible in every request, trivial to test and route. The most common choice in practice.
**Header versioning** (`Accept: application/vnd.myapp.v2+json`) — keeps URLs clean/stable, but the version is invisible unless you're specifically looking for it, which makes debugging and exploration slightly harder.

Either way, the actual discipline is: only bump the version for changes that would break an existing client (renaming/removing a field, changing a type, changing required parameters) — not for additions.

**Interview line:** *"I default to URI versioning — it's explicit and easy to route and test. Header versioning keeps URLs cleaner but hides the version from casual inspection. Either way, I only bump the version for breaking changes, not additive ones, so I'm not forcing clients to migrate more often than necessary."*

**Tests:** API evolution, backward compatibility

*Axis: normal · Source: challenge question*

---

### "How do you design pagination? Offset vs cursor pagination?"

**Offset-based** (`?page=2&limit=20` or `?offset=40&limit=20`) — simple, and you can jump to any arbitrary page. But on a large table, the database still has to scan and skip all the preceding rows to get to a high offset, which gets slow. Worse: if rows are inserted/deleted while someone's paging through, items can shift between pages — a user can see the same item twice or miss one entirely.

**Cursor-based** (`?cursor=abc123&limit=20`) — the cursor is an opaque pointer to "the last item you saw" (often an encoded ID or timestamp). The next request says "give me 20 more after this point." This is fast at any depth (the database seeks directly via an index, it doesn't scan-and-skip) and stable against inserts — but you lose the ability to jump to an arbitrary page, only next/previous.

**Rule of thumb:** offset for small, simple, admin-style tables where jumping to page 7 matters. Cursor for anything large or real-time — feeds, activity logs, anything Instagram/Twitter-shaped.

**Interview line:** *"Offset pagination is simple and lets you jump to any page, but it gets slow on large tables and can skip or duplicate items if data changes while paging. Cursor pagination is stable and fast at any depth because it seeks via an index instead of skipping rows — the trade-off is you only get next/previous, not arbitrary page numbers. I use cursor for anything large or real-time, offset for small admin tables."*

**Tests:** pagination trade-offs, scale

*Axis: performance · Source: challenge question*

---

### "How do you design filtering/sorting?"

Both live as query parameters, kept predictable and composable so they can be combined freely:

```
GET /products?category=electronics&price_min=100&price_max=500&sort=-rating,price
```

Filtering: one query param per filterable field (`category=electronics`), with range filters as paired params (`price_min` / `price_max`) rather than inventing a custom query syntax. Sorting: a `sort` param, with a `-` prefix for descending (`sort=-price`), and comma-separated for multiple sort keys applied in order.

The design discipline that matters more than the syntax: only expose filtering/sorting on fields that are actually **indexed** — an unindexed filter on a large table is an easy way to accidentally ship a slow endpoint.

**Interview line:** *"Filters and sort go in query params, kept predictable — one param per filterable field, a `-` prefix for descending sort. The thing I actually watch for is making sure every filterable/sortable field is indexed, otherwise it's an easy way to ship an endpoint that's fast in dev and slow in production."*

**Tests:** query design, index awareness

*Axis: performance · Source: challenge question*

---

### "How do you prevent clients from requesting excessive data?"

A few layers, usually combined:
- **Mandatory pagination with a max page size** — cap `limit` server-side (e.g. reject or clamp `limit=10000` down to a sane max like 100), so a client can't request the entire table in one call.
- **Field selection** (sparse fieldsets) — let clients ask for only the fields they need (`?fields=id,name,email`), so a client that only needs a name doesn't pull the entire object graph.
- **Rate limiting** — caps how often a client can call the API at all, independent of any single request's size.
- **Depth/complexity limits** for nested data (especially relevant in GraphQL, where a client could otherwise request deeply nested relations that turn into an expensive query).

**Interview line:** *"I cap page size server-side regardless of what the client asks for, support field selection so clients aren't forced to pull the whole object graph, and back it with rate limiting so it's not just about one request's size but how often they can call the API at all."*

**Tests:** API abuse prevention, resource protection

*Axis: scale · Source: challenge question*

---

### "How do you design bulk APIs? How do you handle partial success in bulk operations?"

A bulk endpoint takes an array of items in one request instead of forcing N separate calls (`POST /orders/bulk` with an array, instead of 500 individual `POST /orders`). This matters for both client efficiency (fewer round trips) and server efficiency (batching database writes).

The part people get wrong is treating it as strictly all-or-nothing. Usually the items are independent — item #37 failing validation shouldn't roll back the other 499 that were fine. Report **per-item status** instead of one blanket result:

```json
POST /orders/bulk
{
  "succeeded": [{"id": 1}, {"id": 2}],
  "failed": [{"index": 2, "reason": "invalid SKU"}]
}
```

Use `207 Multi-Status` when the outcome is genuinely mixed, or design the client contract so it always expects a per-item breakdown rather than a single success/failure flag.

**Interview line:** *"A bulk API takes an array in one request instead of forcing many round trips. The key design decision is not treating it as all-or-nothing — I return per-item success/failure, usually with 207 Multi-Status, so the caller can retry just what failed instead of resubmitting everything."*

**Tests:** bulk operation design, partial failure handling

*Axis: failure · Source: challenge question*

---

### "How do you design API error responses?"

A bare status code isn't enough for a client (or a developer debugging the integration) to know what actually went wrong. A good error response is **structured and consistent** across the whole API:

```json
400 Bad Request
{
  "error": {
    "code": "INVALID_EMAIL",
    "message": "Email format is invalid",
    "field": "email"
  }
}
```

The `code` is a stable, machine-readable string a client can branch on (`if error.code === 'INVALID_EMAIL'`) — the `message` is for humans and can change wording without breaking client logic. Never leak internals in the message — stack traces, SQL errors, file paths — that's an information-disclosure risk, not just an aesthetics issue.

**Interview line:** *"Every error follows the same shape — a stable machine-readable code, a human-readable message, and which field it relates to if applicable. The code is what a client actually branches on, so it can't change; the message can. And I never leak internals like a stack trace or a raw database error into that response."*

**Tests:** API consistency, security (info disclosure)

*Axis: normal · Source: challenge question*

---

### "How do you make APIs backward compatible? How do you deprecate an API?"

**Backward compatible** changes are additive and don't require clients to change anything: adding a new optional field, adding a new endpoint, adding a new optional query parameter. **Breaking** changes — renaming/removing a field, changing a field's type, making an optional parameter required — need a version bump, because an old client calling the new version would break.

**Deprecating** an old version doesn't mean flipping it off — it's a process:
1. Ship the new version (`/v2`) while `/v1` keeps working.
2. Mark `/v1` deprecated — via docs, and ideally a `Deprecation` / `Sunset` HTTP header so automated tooling can detect it too.
3. Give a real, communicated timeline (weeks/months, not days) before `/v1` actually stops working, and monitor `/v1` traffic to know who's still on it.
4. Only remove it once traffic has genuinely dropped to near-zero, or the deadline passes with fair warning given.

**Interview line:** *"Additive changes — new optional fields, new endpoints — don't need a version bump. Anything that would break an existing client's assumptions does. Deprecating a version means keeping the old one running, marking it deprecated with a real timeline and a Sunset header, and only removing it once usage has actually dropped — not just turning it off the day the new version ships."*

**Tests:** API lifecycle management, breaking vs non-breaking changes

*Axis: normal · Source: challenge question*

---

### "How do you handle API rate limiting? Token bucket vs leaky bucket?"

Rate limiting caps how many requests a client can make in a time window, protecting the API from abuse and from one client starving capacity for everyone else. Two classic algorithms:

**Token bucket** — a bucket holds up to N tokens, refilling at a steady rate; each request consumes one token, and a request is rejected if the bucket's empty. This naturally allows **bursts** — if the bucket's been filling while idle, a client can fire off a burst up to the bucket's capacity, then has to slow down to the refill rate.

**Leaky bucket** — requests queue up and get processed (or "leak out") at a strictly constant rate, regardless of how bursty the incoming traffic is. Smooths traffic out completely — no bursts allowed, at the cost of adding latency to bursty clients whose requests now wait in the queue.

In practice, a common and simple production implementation is a **fixed or sliding window counter in Redis** (`INCR` a key, set a `TTL`), which behaves close to token bucket but is far simpler to reason about and deploy at the scale of an API gateway.

**Interview line:** *"Token bucket allows bursts up to the bucket size, then throttles to the refill rate — good when occasional bursts are fine. Leaky bucket smooths traffic to a strictly constant rate, no bursts at all, at the cost of added latency for bursty clients. In practice I'd usually just implement it with Redis — INCR a counter with a TTL — which is simple and close enough to token bucket for most APIs."*

**Tests:** rate limiting algorithms, API protection

*Axis: scale · Source: challenge question*

---

### "How do you design API authentication? Authentication vs authorization?"

**Authentication** answers "who are you?" — proving identity, typically a bearer token (JWT) sent in the `Authorization` header, validated on every request. **Authorization** answers "what are you allowed to do?" — once identity is known, deciding whether this specific user can perform this specific action on this specific resource.

```
401 Unauthorized  → authentication failed: no valid token / not logged in
403 Forbidden     → authentication succeeded, but this user isn't allowed to do this
```

A design mistake worth naming explicitly: authentication is almost always the *easy* part (validate the token); authorization is where real bugs live, because it has to be checked **per resource**, not just per endpoint — "is this user allowed to call `DELETE /orders/:id`" is a different, harder question than "is this user allowed to delete *this specific* order" (i.e., do they even own it).

**Interview line:** *"Authentication is proving who you are — validating a token. Authorization is deciding what that identity is allowed to do, and the part that actually causes bugs is that it has to be checked per-resource, not just per-endpoint — being allowed to call the delete endpoint at all is different from being allowed to delete this specific record."*

**Tests:** authn vs authz, resource-level authorization

*Axis: normal · Source: challenge question*

---

### "RBAC vs ABAC?"

**RBAC (Role-Based Access Control)** — permissions attach to a **role** (`admin`, `editor`, `viewer`), and a user gets permissions by being assigned a role. Simple to reason about and implement, and covers most apps fine — "can an admin delete a user? yes."

**ABAC (Attribute-Based Access Control)** — permissions are evaluated from **attributes** of the user, the resource, and the context, combined into rules: "a user can edit a document if `document.ownerId === user.id` OR (`user.role === 'editor'` AND `document.status !== 'locked'`)." Far more flexible — handles cases RBAC can't express cleanly, like "you can only edit your *own* documents" or "only during business hours" — at the cost of real complexity in both design and debugging (a denial can be hard to explain when it's the result of several combined rules).

**Choose RBAC** for straightforward permission tiers. **Choose (or add) ABAC** when access genuinely depends on relationships between the user and the specific resource (ownership, tenancy, resource state), not just on a static role.

**Interview line:** *"RBAC gives permissions to a role — simple, and covers most apps. ABAC evaluates rules against attributes of the user, resource, and context — I reach for it when access actually depends on the relationship between the user and the specific resource, like 'only the owner can edit this,' which a static role can't express."*

**Tests:** access control models

*Axis: normal · Source: challenge question*

---

### "How do you securely expose tenant-specific APIs?"

The core risk in a multi-tenant API is a request from Tenant A somehow reading or writing Tenant B's data — usually because a query filters by resource ID but forgets to *also* filter by tenant. The design discipline:

- **Derive the tenant from the authenticated identity** (the token/session), never from a client-supplied parameter like a URL or body field — a client-supplied `tenantId` can just be edited to someone else's.
- **Enforce tenant scoping at the data-access layer**, not just in application logic scattered across handlers — e.g. a query wrapper that automatically injects `WHERE tenant_id = :currentTenant` on every query, so it's structurally impossible to forget it in one endpoint.
- **Return 404, not 403, for cross-tenant access attempts** — a 403 confirms the resource exists but you're not allowed to see it, which itself leaks information across tenants; a 404 reveals nothing.

This gets its own deeper scenario — "your API accidentally returned another tenant's data" — in [`14-multi-tenancy/`](../14-multi-tenancy/) once we get there.

**Interview line:** *"I derive the tenant from the authenticated token, never from anything the client can supply directly, and I enforce that scoping at the data-access layer so it's structurally impossible for one handler to forget the tenant filter. And a cross-tenant access attempt returns 404, not 403, so I'm not even confirming the resource exists."*

**Tests:** multi-tenant security, data isolation

*Axis: failure · Source: challenge question*

---
