# Inbox

> Append new questions at the bottom, raw. See [00-README.md](00-README.md) for format and triage process.

---

- [x] "How would you secure an API endpoint?" — self-study

  **Answer:** Layer it, endpoint by endpoint — no single control does the whole job:
  1. **Transport** — HTTPS/TLS only, never plain HTTP, so nothing in transit (including auth tokens) can be read or tampered with on the wire.
  2. **Authentication** — verify *who* is calling (JWT/session, see below) before anything else runs.
  3. **Authorization** — verify *what that identity is allowed to do* on this specific resource, separately from authentication — being logged in doesn't mean being allowed to hit every endpoint or every record (e.g. user A editing user B's order by just changing the ID in the URL — this has to be checked server-side per request, not assumed from the fact that a token was valid). The *model* behind that check is usually **RBAC** (permissions attached to a role — `admin`/`editor`/`viewer`) for straightforward tiers, or **ABAC** when access depends on the relationship between the user and the specific resource (ownership, tenancy) rather than a static role — "only the owner can edit this" isn't expressible as a role alone.
  4. **Input validation** — never trust the payload; validate types/shape strictly, and use parameterized queries so input can never be interpreted as query syntax (SQL/NoSQL injection).
  5. **Rate limiting** — cap requests per IP/account/key so the endpoint can't be brute-forced or hammered into denial-of-service.
  6. **Least-privilege data exposure** — the response shouldn't leak more than the caller needs (don't return a full user object with password hash/internal fields just because it was convenient to `SELECT *`).

  **Interview line:** *"I don't rely on one control — HTTPS so the transport itself is safe, authentication to know who's calling, authorization checked separately per resource so a valid token doesn't imply access to everything, strict input validation with parameterized queries against injection, rate limiting against abuse, and making sure the response itself doesn't over-expose data. Authentication and authorization are the two most commonly conflated — a valid token only proves identity, not permission."*

  → Deeper material: [scenario-bank/08-security/app-security-fundamentals.md](../scenario-bank/08-security/app-security-fundamentals.md) (injection, brute-force defenses, internal APIs, secrets), [scenario-bank/08-security/auth-and-tokens.md](../scenario-bank/08-security/auth-and-tokens.md) (JWT vs sessions, token storage, revocation), [scenario-bank/02-api-design/rest-design-fundamentals.md](../scenario-bank/02-api-design/rest-design-fundamentals.md) (rate limiting mechanics)

- [x] "How would you secure your application?" — self-study

  **Answer:** The endpoint-level answer above is one layer of a bigger picture — "secure the application" is really several independent layers stacked, because a single strong layer doesn't compensate for a weak one elsewhere:
  - **Input/output** — injection prevention (parameterized queries) on the way in, XSS prevention (escape/sanitize rendered content, `Content-Security-Policy`) on the way out.
  - **Session/identity** — CSRF defenses (`SameSite` cookies) alongside whatever auth model is used (JWT vs session — see linked note), tokens stored where they're least exposed (in-memory / `httpOnly` cookie, not `localStorage`).
  - **Access control model** — authentication only proves *who*; a separate model decides *what they can do*. **RBAC** attaches permissions to a role (simple, covers most apps). **ABAC** evaluates rules against attributes of the user/resource/context — reach for it when access depends on ownership or tenancy, not just a static role.
  - **Credential hygiene** — strong password hashing (bcrypt/argon2) so a leaked database doesn't mean leaked plaintext passwords; brute-force defenses (rate limiting + lockout) on login specifically.
  - **File handling** — validate uploads by actual content not extension, never serve/execute uploads from the app's own code directory, generate filenames server-side to kill path traversal.
  - **Secrets** — in a secrets manager, never committed to source control or baked into an image; a clear, practiced rotation process for when one leaks.
  - **Internal surface** — "internal" doesn't mean "trusted by default" — authenticate service-to-service calls too (mTLS or service tokens), network-segment so internal services aren't reachable from outside, least privilege between services.
  - **Dependencies** — third-party packages are part of the attack surface too; keep them patched, audit for known CVEs (`npm audit` or equivalent) rather than assuming "it's just a library."

  **Interview line:** *"I think about it as layers, not one big fix — input handling against injection and XSS, session/token handling against CSRF and token theft, credential hygiene so a database leak doesn't mean plaintext passwords, careful file upload handling, secrets kept out of source control with a real rotation process, and treating internal services as untrusted by default too. No single layer covers for a gap in another, which is why a real security review goes through all of them rather than picking the one that feels most relevant."*

  → Deeper material: [scenario-bank/08-security/app-security-fundamentals.md](../scenario-bank/08-security/app-security-fundamentals.md) (full depth on every bullet above), [scenario-bank/08-security/auth-and-tokens.md](../scenario-bank/08-security/auth-and-tokens.md), [scenario-bank/02-api-design/rest-design-fundamentals.md](../scenario-bank/02-api-design/rest-design-fundamentals.md) (RBAC vs ABAC)

- [x] "How do REST APIs work?" — self-study

  **Answer:** REST models everything as a **resource** (a noun — a user, an order, a document), addressed by a URL, acted on through a small, fixed set of standard HTTP methods rather than custom action names in the URL:

  ```
  GET    /orders/123   → read order 123
  POST   /orders       → create a new order (server assigns the ID)
  PUT    /orders/123   → replace order 123 entirely
  PATCH  /orders/123   → update part of order 123
  DELETE /orders/123   → remove order 123
  ```

  The **verb comes from the HTTP method**, not the URL — `/getOrder` or `/deleteOrder` isn't RESTful; `GET /orders/123` and `DELETE /orders/123` are. A few properties fall out of that model:
  - **Stateless** — each request carries everything the server needs to understand it (auth token, params); the server doesn't keep client session state between requests, which is what lets you scale by just adding more identical server instances.
  - **Uniform interface** — the same verbs mean the same thing everywhere in the API, so a client doesn't need endpoint-specific knowledge of how to create vs. update vs. delete.
  - **Status codes carry meaning** — `2xx` success, `4xx` the client did something wrong (bad input, not authorized), `5xx` the server failed — a client can react programmatically to the *category* without parsing the response body.
  - **Representations, not the resource itself** — the client never touches the actual database row; it gets a JSON (usually) *representation* of it, and modifies the resource by sending a new representation back.

  A production-grade REST API adds pagination on list endpoints, structured/consistent error bodies, versioning for breaking changes, and auth on everything not explicitly public — the verbs-as-methods idea is the shape, these are what make it hold up under real traffic.

  **Interview line:** *"REST treats everything as a resource addressed by a URL, and the action comes from the HTTP method — GET, POST, PUT, PATCH, DELETE — not from the URL itself. It's stateless, so every request is self-contained and the server doesn't hold client state between calls, which is exactly what makes horizontal scaling straightforward. Status codes tell the client the outcome category without it needing to parse the body, and what the client gets back is a representation of the resource, not the resource itself."*

  → Deeper material: [scenario-bank/02-api-design/rest-design-fundamentals.md](../scenario-bank/02-api-design/rest-design-fundamentals.md) (PUT vs PATCH vs POST, versioning, 202 Accepted), [System-design/11-api-design.md](../System-design/11-api-design.md) (full worked example)

- [x] "Walk me through what happens end-to-end when a user submits a form in your app — frontend to database and back." — self-study

  **Answer:** This is the question that checks whether you actually understand the whole stack you work in, not just your favorite layer — walk it as one continuous chain, naming what each stage owns:

  1. **Client-side validation (fast, but never trusted)** — the form checks required fields, types, formats before ever making a network call, purely for immediate UX (no round-trip needed to tell the user an email field is empty). This is a courtesy, not a security boundary — anyone can bypass it with devtools or curl, which is exactly why step 5 has to re-check everything.
  2. **Request sent** — the client serializes the form state into a request body (usually JSON), attaches the auth token (header or cookie), and sends it over HTTPS to the right endpoint (`POST /orders`, say).
  3. **Middleware chain, server-side** — before the actual handler runs: parse the body, authenticate the token (who is this?), authorize the action (are they allowed to create an order?), and often rate-limit/validate-shape at this layer too — each a separate concern, run in sequence, any one of them can short-circuit the request with an error before the "real" logic ever executes.
  4. **Server-side validation (the real gate)** — re-validate everything the client already checked, plus things the client can't check: does this referenced ID actually exist, does this violate a business rule, is this within limits for this account. This is the actual security/correctness boundary — step 1 was UX, this is enforcement.
  5. **The write** — the handler talks to the database. If it's a single write, that's the whole story; if it's multiple related writes that must all succeed together (e.g. create the order *and* decrement inventory), that's wrapped in a transaction so a failure partway through can't leave the system in a half-applied state.
  6. **Response built** — success: usually `201 Created` with the new resource's representation (or its ID/location). Failure: a structured error body with a status code the client can branch on (`400` bad input, `409` conflict, `500` server fault) — not a generic "something went wrong."
  7. **Client updates state** — on success, the UI reflects the new state (optimistic update already applied and now confirmed, or applied only now if not optimistic); on failure, the error is surfaced back near the field/action that caused it, and any optimistic change gets rolled back.

  **Interview line:** *"Client-side validation is UX only, never trust — the real gate is server-side. The request goes through a middleware chain — auth, then authorization, then validation — before the handler touches the database, and if it's multiple related writes I wrap them in a transaction so a partial failure can't leave inconsistent state. The response comes back with a status code the client can actually branch on, and the UI updates or rolls back an optimistic change based on that. Naming each stage's specific responsibility — not just 'frontend talks to backend' — is what shows I actually understand the boundary between them, not just my own layer."*

  → Deeper material: [scenario-bank/02-api-design/api-design.md](../scenario-bank/02-api-design/api-design.md) (idempotency on the write), [database/04-transactions-and-acid.md](../database/04-transactions-and-acid.md) (why the transaction matters), [nodejs/06-http-and-express.md](../nodejs/06-http-and-express.md) (the middleware chain, validation), [scenario-bank/06-frontend-architecture/state-management.md](../scenario-bank/06-frontend-architecture/state-management.md) (optimistic updates and rollback)
