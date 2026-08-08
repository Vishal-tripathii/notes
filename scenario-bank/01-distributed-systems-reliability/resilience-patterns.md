# Resilience Patterns — Scenario Bank

---

### "What's your approach to retries, backoff, and circuit breakers?"

These three solve **different failure modes**, and using only one of them is usually the mistake.

**Retries — "try again, it might have been transient"**

Network blips, momentary overload, a dropped connection — a lot of distributed-system failures are transient, and a second attempt just works. But retries are only safe when the operation is **idempotent** (or has an idempotency key — same guarantee as the payment idempotency scenario). Retrying a non-idempotent `POST` blindly risks duplicating the side effect.

- Retry on: timeouts, connection resets, 5xx, sometimes 429 (respecting `Retry-After`).
- Don't retry on: 4xx client errors (400/401/404) — the request itself is wrong; retrying changes nothing.
- Always cap the attempts (e.g. 3–5) — unbounded retries during a real outage amplify load on an already-struggling service.

**Backoff — "don't retry immediately, and don't retry in lockstep"**

- Fixed delay — simplest, but if many clients fail at the same moment, they all retry at the same moment too → synchronized spike (thundering herd).
- Exponential backoff — delay doubles each attempt (1s, 2s, 4s, 8s…), giving a struggling service progressively more room to recover.
- Exponential backoff + jitter — add randomness to the delay so thousands of clients don't retry in sync. This is the actual production standard (AWS's "Exponential Backoff and Jitter"). Rough formula: `delay = random(0, min(cap, base * 2^attempt))`.

**Circuit breakers — "stop retrying, the problem isn't transient anymore"**

Retries alone have a nasty failure mode: if a downstream dependency is genuinely down (not just flaky), every caller retrying it just piles more load onto a dead service — and ties up your own threads/connections waiting on doomed calls. At scale this can turn a partial outage into a full one — a self-inflicted retry storm.

A circuit breaker wraps the call and tracks failure rate, with three states:
- **Closed** — normal operation, requests flow through, failures are counted.
- **Open** — failure threshold exceeded → fail immediately, without even attempting the call, for a cooldown period. Protects both the dying dependency and your own resources.
- **Half-open** — after cooldown, let a small number of trial requests through. Succeed → close (resume normal). Fail → reopen (reset cooldown).

**How they compose**

`attempt → fails → retry with backoff (a few times, for transient blips) → still failing → circuit breaker trips open → fail fast / fallback (cached data, degraded response) → half-open trial after cooldown → close if recovered`

Two things people forget that make this whole chain actually work: a **timeout on every individual attempt** (a retry loop is useless if a single attempt can hang forever), and a **bulkhead** — isolating the connection/thread pool per-dependency so one slow downstream doesn't starve calls to everything else.

Real implementations: Netflix Hystrix (the pattern's origin, now deprecated) → resilience4j (Java), Polly (.NET), `opossum`/`cockatiel` (Node).

**Tests:** failure handling, distributed systems reasoning, retry safety vs idempotency, protecting a downstream vs protecting yourself

*Axis: failure · Source: real interview*

#### Follow-ups

- **Scale:** Your service runs as 10 horizontally-scaled pods, each with its own in-process circuit breaker tracking its own failure count independently. What breaks about that, and how would you fix it?
  → Two separate problems. First, **slower collective detection**: if traffic is load-balanced across 10 pods, each pod only sees roughly 1/10th of the calls to that dependency, so each pod's own failure count climbs ~10x slower toward the trip threshold than if it saw the whole picture — the dependency can be effectively down while no single pod's breaker has tripped yet. Second, **inconsistent state**: pods can sit in different states at the same time — one pod trips open while the other nine stay closed and keep hammering the dead dependency, which defeats the entire point of "stop overloading the downstream." And when the dependency does recover, each pod independently decides when to send its own half-open trial, so recovery isn't coordinated.
  Fix: share the breaker's state across instances — typically a Redis-backed failure counter (with TTL window) plus a shared open/closed/half-open flag, so the threshold is evaluated against the *aggregate* failure rate and only one instance issues the half-open trial at a time. Trade-off: that adds a dependency and a small amount of latency to every call's hot path, so some teams instead push this down a level — a service mesh (Istio/Envoy outlier detection) aggregates health signals across the fleet and ejects unhealthy hosts from the load-balancer pool cluster-wide, solving the same coordination problem at the infra layer instead of in application code.

- **Design:** For an actual payment call, is auto-retry-on-failure even the right default — or is that specifically the case where retrying is dangerous?
  → It's dangerous as a *default*. The core problem: a timeout doesn't tell you which side of the boundary the failure happened on — "the charge never went out" and "the charge succeeded but the response was lost" look identical to the client. Blindly retrying assumes the former; if it's actually the latter, you double-charge.
  So for payments, retrying is only safe when it's a *designed* decision, not inherited automatically from a generic retry wrapper applied uniformly to every outgoing call: every attempt, including retries, must carry the same idempotency key, so a duplicate lands as "replay of my in-flight/completed request" server-side rather than a new charge. Some systems go a step more conservative and don't blindly retry the charge step at all — instead they query the payment provider's transaction status using that same idempotency/intent ID first, and only retry if the provider confirms nothing actually happened. That "reconcile before retry" approach is the safer choice when you don't fully trust that the provider's own idempotency implementation is airtight.

---
