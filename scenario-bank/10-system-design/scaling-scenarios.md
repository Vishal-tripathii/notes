# System Design — Scaling Scenarios

> "Your API gets 10× traffic" is the same scenario as [`02-api-design/api-scenario-debugging.md`](../02-api-design/api-scenario-debugging.md)'s "100× traffic" question — cross-linked, not repeated. "How do you prevent a hot partition?" is fully covered in [`03-databases/scaling-and-sharding.md`](../03-databases/scaling-and-sharding.md).

---

### "Your database becomes the bottleneck. What do you do?"

First, find out *which kind* of bottleneck it actually is — the fix is different depending on the answer, so don't jump straight to "add a replica" or "shard it" without knowing:

- **Read-heavy** (most queries are reads) → **read replicas** (route reads off the primary) and **caching** in front of the hottest reads — usually the highest-leverage, lowest-effort fix.
- **Write-heavy** (writes themselves are saturating the primary) → replicas don't help (every replica still applies every write); this is when **sharding** actually becomes necessary — see [`03-databases/scaling-and-sharding.md`](../03-databases/scaling-and-sharding.md).
- **Specific slow queries**, not overall volume → this is a query/index problem, not a scaling problem — `EXPLAIN`, find the missing index or N+1 pattern (see [`03-databases/query-performance.md`](../03-databases/query-performance.md)) before reaching for any infrastructure change at all.
- **Connection exhaustion** (the database itself is fine, but the app can't get a free connection) → connection pool sizing/tuning, or reducing how long each connection is held (shorter transactions).

**Interview line:** *"I wouldn't jump straight to sharding — I'd first figure out whether it's read-heavy, write-heavy, a specific bad query, or connection exhaustion, because each has a completely different fix. Read-heavy usually just needs replicas and caching. Write-heavy is when sharding actually becomes necessary, since replicas don't help there. A lot of 'database is the bottleneck' turns out to be one missing index, not a scaling problem at all."*

**Tests:** bottleneck diagnosis before reaching for infrastructure

*Axis: scale · Source: challenge question*

---

### "One endpoint gets 90% of traffic. What do you change?"

A single hot endpoint is worth treating specially rather than just scaling the whole service uniformly — the other endpoints don't need the capacity you'd be provisioning for the hot one, so uniform scaling is wasteful, and there's usually endpoint-specific leverage available:

- **Cache aggressively, specific to this endpoint** — if it's a read, this is almost always the biggest win; even a short TTL dramatically cuts the load reaching the database for the 90% case.
- **Check if it can be served statically/from a CDN** — if the response is the same for many/all users, it may not need to hit the application at all.
- **Isolate it** — if it's disproportionately consuming shared infrastructure (thread pool, connection pool), consider dedicated capacity for this endpoint specifically (its own service instance pool, its own connection pool) so it can't starve everything else, and so it can be scaled independently of the other 10% of traffic.
- **Look for what's actually expensive inside it** — profile the endpoint's own handler; a hot endpoint with an accidentally-expensive implementation (an N+1 query, a synchronous call to something slow) matters far more once traffic is concentrated on it.

**Interview line:** *"A hot endpoint deserves endpoint-specific treatment, not just scaling the whole service uniformly, since the other endpoints don't need that capacity. Caching is usually the biggest lever if it's a read. Beyond that I'd isolate it — its own resource pool — so it can't starve the other 10% of traffic, and profile it specifically, since any inefficiency in its handler matters far more once 90% of all traffic is concentrated there."*

**Tests:** hot-path optimization, resource isolation

*Axis: scale · Source: challenge question*

---

### "One tenant becomes 100× larger than everyone else. What happens?"

Same shape as the "one customer consuming 80% of API capacity" noisy-neighbor scenario in [`02-api-design/api-scenario-debugging.md`](../02-api-design/api-scenario-debugging.md), but at the infrastructure level rather than just rate limiting: shared infrastructure sized for "many small/medium tenants" starts breaking down when one tenant's data volume or traffic dwarfs everyone else's — a shared database can develop a hot partition/shard around that one tenant's ID (see [`03-databases/scaling-and-sharding.md`](../03-databases/scaling-and-sharding.md)), shared connection/thread pools can be dominated by that one tenant's requests, and shared caches can get crowded out by that tenant's working set, degrading service for every *other*, smaller tenant sharing the same infrastructure.

The response, roughly in order: detect it (per-tenant metrics — without them, you don't even know one tenant is disproportionate until other tenants start complaining), isolate it (per-tenant rate limits/quotas so it can't starve others, as in category 02), and at the extreme, give that one tenant **dedicated infrastructure** — a separate database, separate compute — rather than trying to keep scaling shared infrastructure just to accommodate a single outlier. This gets deeper treatment, including the isolation/leak-prevention angle, in [`14-multi-tenancy/`](../14-multi-tenancy/).

**Interview line:** *"This is the noisy-neighbor problem at the infrastructure level — shared database partitions, connection pools, and caches sized for many similar-sized tenants start degrading for everyone else once one tenant is 100× larger. I'd need per-tenant metrics to even detect it, then isolate that tenant with dedicated quotas, and at the extreme give them fully dedicated infrastructure rather than continuing to scale shared infrastructure just to accommodate one outlier."*

**Tests:** multi-tenant scale, noisy neighbor at the infra level

*Axis: scale · Source: challenge question*

---

### "How do you scale WebSocket connections?"

WebSockets are fundamentally different from a typical HTTP request for scaling purposes: a connection is **long-lived and stateful** — the server holds it open for as long as the client is connected, rather than handling a request and immediately forgetting about it. This changes the scaling math: capacity is bound by **concurrent open connections**, not requests-per-second, and a single server has a real ceiling on how many connections it can hold open at once (limited by memory per connection and OS file-descriptor limits).

- **Horizontal scaling works, but with a wrinkle**: a load balancer distributes *new* connections across multiple server instances, but once a client is connected to a specific instance, that connection stays pinned there — the LB needs to support **sticky sessions** (or the WebSocket handshake itself is done such that it stays on one backend) since a WebSocket can't be transparently handed off between servers mid-connection the way a stateless HTTP request can.
- **Cross-instance messaging is the hard part** — if instance A needs to push a message to a client connected to instance B (e.g. a chat message from a user on A needs to reach a recipient connected to B), the instances need to communicate — typically via a shared pub/sub layer (Redis pub/sub is the classic pattern) that all instances subscribe to, so any instance can publish and the instance actually holding the relevant connection delivers it.
- **Set real connection limits per instance** and monitor them, since exceeding available file descriptors/memory for connections is a hard failure mode, not a gradual slowdown.

**Interview line:** *"WebSockets scale differently because a connection is long-lived and stateful, so capacity is bound by concurrent open connections, not requests per second, and it's pinned to whichever server instance accepted it — the load balancer needs sticky sessions. The harder part is cross-instance messaging: if a message needs to reach a client connected to a different instance than the one that produced it, I'd use a shared pub/sub layer like Redis so any instance can publish and whichever instance actually holds that connection delivers it."*

**Tests:** stateful connection scaling, cross-instance communication

*Axis: scale · Source: challenge question*

---

### "How do you scale background workers?"

Background workers pull jobs off a queue and process them — scaling them means increasing how many jobs get processed per unit time, and the approach depends on what's actually limiting throughput:

- **More worker instances/processes** pulling from the same queue — the direct lever, straightforward as long as the queue itself can support many concurrent consumers (see consumer scaling/partition limits in [`05-messaging-event-driven/messaging-fundamentals.md`](../05-messaging-event-driven/messaging-fundamentals.md)).
- **Right-size concurrency per worker** — a worker doing I/O-bound jobs (calling external APIs, waiting on a database) can often process many jobs *concurrently* within one process/instance without adding more instances; a worker doing CPU-bound jobs benefits far less from added concurrency within one instance and needs more instances (or more CPU) instead.
- **Watch out for jobs with wildly different costs sharing one queue** — a queue mixing "send a quick email" jobs with "process a 2-hour video" jobs means fast jobs get stuck waiting behind slow ones on the same workers; splitting into separate queues (and separately-scaled worker pools) per job type/cost avoids that.
- **Autoscale on queue depth**, not a fixed worker count — the number of workers needed to keep up varies with job arrival rate, so tying worker count to queue depth (scale up when the backlog grows, down when it's empty) is more efficient than either over-provisioning for peak or under-provisioning and accumulating lag.

**Interview line:** *"I scale background workers by adding more instances pulling from the same queue, but I size concurrency per worker based on whether the work is I/O-bound — which benefits a lot from concurrency within one instance — or CPU-bound, which doesn't. I'd also split queues by job type if fast and slow jobs are mixed together, so fast jobs don't get stuck behind slow ones, and autoscale worker count based on queue depth rather than a fixed number."*

**Tests:** worker pool scaling, queue design

*Axis: scale · Source: challenge question*

---
