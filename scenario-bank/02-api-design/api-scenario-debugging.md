# API Scenario & Debugging Questions — Scenario Bank

---

### "Your API suddenly receives 100× traffic. What changes?"

The honest first answer is: figure out **where it actually breaks first**, not "add more servers everywhere." Traffic doesn't stress every layer equally — usually the database is the first bottleneck (connection pool exhaustion, CPU-bound queries), because databases scale far less easily than stateless app servers.

Practical response, roughly in order:
1. **Add caching** in front of anything read-heavy — this is usually the highest-leverage single change, since it removes load from the database entirely for repeat reads.
2. **Scale the stateless app tier horizontally** — this is cheap and fast if the app is actually stateless.
3. **Rate limit** to protect against the traffic being abusive rather than legitimate, and to buy time.
4. **Check the database** — read replicas for read-heavy load, connection pool sizing, slow query audit.
5. **Queue what can be async** — anything that doesn't need to happen synchronously in the request (emails, non-critical writes) moves to a queue so the request path stays fast.

**Interview line:** *"I wouldn't just scale everything blindly — I'd figure out what breaks first, which is usually the database, not the app servers. Caching in front of reads is usually the highest-leverage fix, then horizontal scaling of the stateless tier, then looking at the database itself — read replicas, connection pooling — and moving anything non-critical off the synchronous request path entirely."*

**Tests:** scaling priorities, bottleneck identification

*Axis: scale · Source: challenge question*

---

### "One customer is consuming 80% of your API capacity. What do you do?"

This is a **noisy neighbor** problem — one tenant's usage is degrading service for everyone else sharing the same infrastructure. The fix isn't to scale the whole system to accommodate one customer's load; it's to **isolate** that load so it can't crowd out others.

- **Per-tenant rate limiting / quotas** — cap what any single customer can consume, regardless of overall capacity, so no one customer can starve the rest.
- **Identify why** — is this legitimate growth (they should probably be on a bigger plan / dedicated infrastructure) or a bug on their end (a retry loop, a misconfigured polling interval)? The fix is different depending on which.
- For a customer that's legitimately huge, consider **dedicated infrastructure** for them specifically, rather than sharing the same pool as smaller customers.

**Interview line:** *"That's a noisy-neighbor problem — one tenant crowding out everyone else on shared infrastructure. I'd cap them with per-tenant rate limits so they can't starve other customers, and separately figure out whether it's legitimate growth that needs a bigger plan, or a bug on their end like a retry loop."*

**Tests:** multi-tenant capacity management, noisy neighbor

*Axis: scale · Source: challenge question*

---

### "A client keeps retrying the same request. How do you protect your API?"

First, figure out *why* — if it's a well-behaved client retrying after your API returned a 5xx or timed out, the client isn't the problem, the underlying failure is. If it's a poorly-behaved client retrying without backoff (hammering you every 100ms), the protections are:

- **Rate limiting** — the direct defense, caps how often any one client can call regardless of intent.
- **Idempotency keys**, if this is a `POST`/write endpoint — so even if the retries do land, they don't duplicate the effect (this also protects the client, not just you).
- **`Retry-After` header** on a 429/503 — tells well-behaved clients explicitly how long to back off, which fixes the problem for anyone actually respecting it.
- If it's clearly abusive rather than a bug — block or throttle that client specifically, harder than the general rate limit.

**Interview line:** *"First I'd check whether the client is retrying because my API is actually failing — that's not a client problem, it's a reliability problem on my end. If it's genuinely excessive, rate limiting is the direct defense, and I'd add a Retry-After header so well-behaved clients back off correctly, plus idempotency keys if it's a write endpoint so the retries can't duplicate effects even if they land."*

**Tests:** rate limiting, root-cause vs symptom

*Axis: failure · Source: challenge question*

---

### "An API response takes 10 seconds. How do you debug it?"

Don't guess — measure, from the outside in:

1. **Reproduce it and time each layer** — is it the network, the app server, or the database? Distributed tracing (see [`11-observability/`](../11-observability/)) makes this fast if it's already instrumented; without it, add timing logs around the suspect boundaries.
2. **Check the database first** — it's the most common culprit. Look at the query plan (`EXPLAIN`) for the queries this endpoint runs — missing index, N+1 query pattern (one query per item in a loop instead of one batched query), a lock being held by something else.
3. **Check for a synchronous call to a slow external dependency** — a third-party API, a downstream service — that this endpoint is waiting on without a reasonable timeout.
4. **Check for something CPU-bound blocking the event loop** (Node-specific) — heavy synchronous computation on the request path stalls everything else too, not just this request.

**Interview line:** *"I wouldn't guess — I'd time each layer to find where the 10 seconds actually goes. Most often it's the database: I'd check the query plan for a missing index or an N+1 pattern first, then look for a synchronous call to a slow dependency without a proper timeout, before assuming it's the application code itself."*

**Tests:** performance debugging methodology

*Axis: performance · Source: challenge question*

---

### "Your API is returning duplicate records. Where do you investigate?"

Work backward from where a duplicate could actually be introduced:

- **The query itself** — a `JOIN` that fans out (one row on the left matching multiple rows on the right) without the intended `DISTINCT` or aggregation, is the single most common cause of "duplicate rows" bugs.
- **Pagination** — offset-based pagination combined with concurrent inserts can return the same row twice across two page requests (see the pagination scenario in [`04-caching/`](../04-caching/) and the offset-pagination trade-offs above) — this looks like "duplicates" from the client's perspective even though the database itself is fine.
- **A retried write that wasn't idempotent** — if this is data that got *written* twice (not just read twice), check whether the write path has an idempotency key; a client retry without one is a classic way to insert the same logical record twice.
- **A race condition on insert** — two concurrent requests both checking "does this exist?" and both deciding "no" before either has inserted, so both insert.

**Interview line:** *"I'd separate 'read returns duplicates' from 'the data itself is duplicated.' For reads, the usual suspect is a JOIN that fans out without DISTINCT, or offset pagination combined with concurrent inserts shifting rows between pages. For the data actually being duplicated, I'd check whether the write path is idempotent — a retried write without an idempotency key is the classic way to insert the same record twice."*

**Tests:** debugging methodology, JOIN fan-out, idempotency

*Axis: failure · Source: challenge question*

---

### "An API works locally but times out in production. What do you check?"

This is almost always an environment difference, not a code bug — the code is identical, so something about the *environment* is different:

- **Data volume** — local dev databases are tiny; a query that's instant on 100 rows can be seconds on 10 million. Check whether the slow query even has an index that matches production's actual data distribution.
- **Network topology** — locally, everything's on `localhost` with near-zero latency; in production, the app might be calling a database or service across an availability zone, through a load balancer, through a VPN — each hop adds real latency that doesn't exist locally.
- **Connection pool exhaustion** — production has real concurrent traffic; if the connection pool to the database or a downstream service is undersized, requests queue waiting for a free connection and eventually time out, while locally there's only ever one request at a time.
- **Different configuration** — a shorter timeout value in the production config than locally, a feature flag, a different (correct, but slower) code path enabled only in production.
- **Resource limits** — a container CPU/memory limit in production that doesn't exist on a local machine, causing throttling under load that's invisible with a single local request.

**Interview line:** *"Since the code's identical, I treat it as an environment problem, not a logic bug. Top suspects: production's actual data volume exposing a missing index that never mattered on a small local dataset, network latency between services that doesn't exist on localhost, or connection pool exhaustion under real concurrent load — none of which show up when I'm the only one hitting it locally."*

**Tests:** production vs local debugging, environment differences

*Axis: failure · Source: challenge question*

---
