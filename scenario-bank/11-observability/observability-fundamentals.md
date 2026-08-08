# Observability Fundamentals — Scenario Bank

---

### "Logs vs metrics vs traces?"

Three complementary tools, each answering a different question when something's wrong:

- **Logs** — discrete, timestamped events with detail: "what exactly happened, here, at this moment" (an error message, a specific request's details). Best for deep-diving into *one* specific incident once you already have a rough idea where to look — verbose, expensive to store/query at scale, not something you can stare at for a system-wide pattern.
- **Metrics** — numeric measurements aggregated over time (request rate, error rate, p99 latency, CPU usage). Best for "is the system healthy right now, and how has it trended" — cheap to store (pre-aggregated), ideal for dashboards and alerting, but they tell you *that* something's wrong, not *why*.
- **Traces** — the path a single request took **across multiple services**, with timing for each hop, as one connected story ("request hit API gateway → auth service (12ms) → order service (340ms) → database (310ms of that 340ms)"). Best for "where in this multi-service chain did the time/error actually happen" — the tool for the specific pain of debugging a slow or failed request in a microservices system, where logs alone would mean manually correlating separate log lines across five different services.

**The typical flow**: a metric/alert tells you something's wrong (error rate spiked) → traces show you *where* in the request chain it's happening (which service/hop) → logs from that specific service give you the *exact* detail of what failed.

**Interview line:** *"Metrics tell me something's wrong and trending — cheap, aggregated, great for dashboards and alerts. Traces show me where in a multi-service request chain the problem actually is, which logs alone can't do without manually correlating across services. Logs give me the exact detail once I already know where to look. In practice it's a funnel: a metric alerts me, a trace narrows down where, logs tell me exactly what."*

**Tests:** observability pillars, when to use each

*Axis: observability · Source: challenge question*

---

### "What should you log? What should you not log?"

**Log:** request start/end with a correlation ID (see below), errors with enough context to actually act on them (stack trace, relevant IDs — user ID, order ID — not just the error message alone), state transitions that matter for debugging ("order moved to shipped"), and anything that would help answer "what led to this" during an incident. The goal is that a log line should be *actionable* — if you can't imagine using it to diagnose something, it's probably noise.

**Never log:** passwords, tokens/API keys, full credit card numbers, and other secrets — even in an error log during a crash, since logs often have broader access/retention than the primary database, and a leaked log is a real, common way secrets end up exposed. Full PII beyond what's operationally necessary should be minimized or masked (log a user ID, not their full profile) — both for privacy/compliance and because it just adds noise without adding debugging value most of the time. And avoid logging so verbosely in a hot path that logging itself becomes a performance problem or a cost problem (log volume directly drives log-ingestion cost at scale).

**Interview line:** *"I log what's actually actionable for debugging — request boundaries with a correlation ID, errors with enough context to act on, meaningful state transitions. I never log secrets — passwords, tokens, full card numbers — even during a crash, since logs often have broader access and retention than the primary database, and that's a real, common way secrets leak. I also keep PII to the minimum needed, both for compliance and because most of it doesn't actually help debugging anyway."*

**Tests:** logging discipline, security/compliance awareness

*Axis: observability · Source: challenge question*

---

### "How do you trace a request across microservices? What is distributed tracing? Correlation/request IDs?"

The core mechanism: generate a unique **correlation ID** (or trace ID) at the very first entry point of a request (the API gateway, or the client itself), and **propagate it through every downstream call** — every service that's called as part of handling this request includes that same ID in its own logs and passes it along to whatever it calls next (typically via an HTTP header, e.g. `X-Correlation-ID` or the standardized `traceparent` header from the W3C Trace Context spec).

**Distributed tracing** builds on this with more structure: each individual step (a "span") records its own start/end time and metadata, and spans are linked into a parent-child tree reflecting the actual call graph — so a tracing UI (Jaeger, Zipkin, or a vendor APM) can render the whole request as a waterfall: which service called which, how long each hop took, and where in that chain an error or the bulk of the latency actually occurred, without having to manually stitch together separate log lines from five different services yourself.

```
traceId: abc-123
├─ span: api-gateway (2ms)
│  └─ span: auth-service (12ms)
│  └─ span: order-service (340ms)
│     └─ span: database query (310ms)  ← here's where the time actually went
```

**Interview line:** *"A correlation ID gets generated at the request's entry point and propagated through every downstream call, usually as a header — every service logs it, so I can find every log line related to one request even across services. Distributed tracing builds structure on top of that — each hop records its own span with timing, linked into a parent-child tree, so I can see a whole multi-service request as a waterfall and immediately spot which specific hop the latency or error actually came from, instead of manually correlating logs by hand."*

**Tests:** distributed tracing mechanics, correlation IDs

*Axis: observability · Source: challenge question*

---

### "How do you detect memory leaks? How do you detect a slow database?"

**Memory leaks:** the primary signal is a **metric trend**, not a single snapshot — memory (heap) usage that climbs steadily over time under steady load and never comes back down, even after garbage collection runs, as opposed to memory that rises and falls normally with traffic. Catching this needs memory usage tracked as a time-series metric with alerting on a sustained upward trend, not just a static "memory > X%" threshold (which a legitimately busy-but-healthy service can also cross temporarily). Once flagged, heap snapshots (see [`07-nodejs-runtime/node-memory-and-streams.md`](../07-nodejs-runtime/node-memory-and-streams.md)) diagnose the specific cause.

**Slow database:** query-level metrics/logging (a slow query log, or `pg_stat_statements`-style tooling) surfaces *which* queries are slow and how often, and a metric on overall database latency (p50/p95/p99 query time) shows the trend over time. Distinguish "database is generally getting slower" (often a growth/index problem, category 03) from "one specific query regressed" (often a new code path, or the query planner's choice changing after a data-distribution shift) — the two point to different investigations, and the metrics/logs together (not either alone) are usually what makes the distinction obvious.

**Interview line:** *"For memory leaks, I look for heap usage climbing steadily over time under steady load and never fully recovering after GC — that's a metric trend, not a single reading, since a legitimately busy service also spikes memory temporarily. For a slow database, I'd combine a slow-query log to see which specific queries are slow with an overall latency metric to see the trend — together they tell me whether it's one query that regressed or a general degradation from data growth."*

**Tests:** proactive monitoring, trend vs snapshot

*Axis: observability · Source: challenge question*

---

### "How do you distinguish application latency from network latency?"

Without breaking it down, "the request took 800ms" doesn't tell you where those 800ms actually went — and the fix is completely different depending on the answer. **Distributed tracing** (above) is the direct tool: each span's timing shows time spent *inside* a service's own processing versus time spent in the network hop *between* spans — a large gap between "service A finished" and "service B started" that isn't accounted for by either span's own processing time is network/transport overhead, not application logic.

Beyond tracing specifically: **server-side timing** (how long the server actually took to process, measured on the server) versus **client-observed total time** (how long the client waited end-to-end) — the difference between the two is everything that isn't the server's own processing: network transit, TLS handshake, DNS lookup, load balancer/proxy hops, connection queueing. Comparing these two numbers directly (many APM tools expose both) isolates "is this slow because my code is slow, or because of everything around my code" without guessing.

**Interview line:** *"I compare server-side processing time against client-observed total time — the gap between them is everything that isn't my application code: network transit, TLS handshake, load balancer hops, queueing. Distributed tracing makes this concrete across a multi-service chain too, since the time between one span ending and the next starting that isn't accounted for by either span's own work is specifically network overhead between those two hops, not application logic in either service."*

**Tests:** latency breakdown, network vs application

*Axis: observability · Source: challenge question*

---

### "What metrics indicate system saturation?"

Saturation means the system is at or near the limit of some resource — the classic signals, per resource:

- **CPU** — sustained high utilization (not a brief spike); on a system approaching saturation, request queueing/latency starts climbing even before CPU literally hits 100%, because contention for CPU time increases wait time.
- **Memory** — usage approaching the configured limit, and specifically the *rate of increase*, not just the current level — the "still fine" question is "will this hit the ceiling soon," not just "is it high right now."
- **Connections/threads** — a connection pool or thread pool at or near its max size, with requests queueing waiting for one to free up — this often shows up as latency increasing well before an outright error ("pool exhausted"), because requests are waiting in line rather than failing outright, right up until they aren't.
- **Queue depth** (for a message queue/background jobs) — a backlog that's growing rather than staying roughly flat is direct evidence that consumption can't keep up with production (see consumer lag, category 05).
- **Disk I/O / disk space** — I/O wait time climbing (the CPU is idle but waiting on disk), or available disk space trending toward zero.

The unifying pattern worth naming explicitly: **latency creeping upward is often the earliest signal of saturation across almost all of these**, arriving *before* the harder failure (errors, OOM kills, connection refusals) — which is exactly why latency percentiles (especially p95/p99, not just average) are usually the first metric worth alerting on, ahead of the harder failure signals.

**Interview line:** *"CPU, memory, connection/thread pool usage, queue depth, disk I/O — each has its own saturation signal, but the unifying pattern is that latency, especially p95/p99, tends to creep upward before any of these actually fails outright. That's why I treat rising latency percentiles as the earliest warning sign across almost all resource types, rather than waiting for a harder failure like an OOM kill or a connection-pool-exhausted error."*

**Tests:** resource saturation signals, leading indicators

*Axis: observability · Source: challenge question*

---

### "What are SLIs, SLOs, and SLAs?"

Three related but distinct terms, moving from measurement to target to contract:

- **SLI (Service Level Indicator)** — the actual **measurement**: a specific metric that reflects user-experienced quality, like "the percentage of requests served in under 200ms" or "the percentage of requests that succeeded." This is just a number you track.
- **SLO (Service Level Objective)** — an internal **target** for that SLI: "99.9% of requests succeed" or "p95 latency under 200ms, measured over a rolling 30 days." This is what your team actually aims for and gets paged about missing.
- **SLA (Service Level Agreement)** — an external, often **contractual** commitment to a customer, usually with consequences (a service credit, a penalty) if it's not met — typically set *looser* than the internal SLO on purpose, so there's margin to notice and fix a problem internally before it ever actually breaches the customer-facing promise.

**Error budget** (a related, practical concept): if the SLO is 99.9% success, the "0.1%" is the **error budget** — a deliberate, spendable allowance for failure, used to make concrete decisions like "we've used most of this month's error budget on incidents, so we should slow down on risky deploys until it resets" — turning "be reliable" from a vague aspiration into an actual number you can make trade-off decisions against.

**Interview line:** *"SLI is the actual measurement — like percentage of requests under 200ms. SLO is the internal target for that measurement, what the team actually gets paged about. SLA is the external, often contractual commitment to a customer, deliberately set looser than the SLO so there's margin to catch and fix a problem before it ever breaches what the customer was promised. The error budget — the gap between 100% and the SLO — is what makes this concrete: it's a spendable allowance for failure that can justify slowing down on risky deploys once it's mostly used up."*

**Tests:** reliability targets, error budgets

*Axis: observability · Source: challenge question*

---

### "How do you design alerts without creating alert fatigue?"

Alert fatigue happens when there are so many low-value or frequently-false alerts that people start ignoring notifications altogether — which is actively dangerous, because it means the *real* incident's alert gets ignored along with all the noise. Design principles:

- **Alert on symptoms that affect users, not every internal anomaly** — "error rate exceeded 5%" (a symptom users actually experience) rather than "this specific internal counter changed" (often not something anyone needs to act on immediately, if at all).
- **Every alert should be actionable** — if an alert fires and there's genuinely nothing a human can or should do about it, it shouldn't page anyone; route it to a dashboard/log instead of an interruption.
- **Tune thresholds to avoid noise from normal variance** — alerting on a single data point crossing a threshold is noisier than alerting on a *sustained* condition (e.g. "error rate over 5% for 5 minutes straight," not "one single elevated data point").
- **Distinguish severity properly** — not everything should page someone at 3am; a genuinely non-urgent issue belongs in a lower-urgency channel (a ticket, a dashboard, a daily digest), reserving paging for things that actually need immediate human attention.
- **Regularly review and prune alerts that fire often but never actually require action** — an alert that's frequently acknowledged-and-ignored is signal that it's miscalibrated and needs its threshold or existence reconsidered, not just tolerated indefinitely.

**Interview line:** *"The core discipline is that every alert has to be actionable — if firing it doesn't lead to someone doing something, it shouldn't interrupt anyone, it belongs on a dashboard instead. I alert on user-facing symptoms rather than every internal anomaly, require a sustained condition rather than one noisy data point, and separate real paging-severity issues from lower-urgency ones that can wait for a ticket. And I'd periodically review which alerts get acknowledged-and-ignored often, because that's the direct signal an alert is miscalibrated."*

**Tests:** alerting design, on-call sustainability

*Axis: observability · Source: challenge question*

---
