# Cascading Failures & Graceful Degradation — Scenario Bank

---

### "What happens when a downstream service is unavailable?"

Your service calls another service over the network. That call can do one of three things: succeed, fail fast (error), or just hang — never coming back. The dangerous one is the hang. If you don't put a limit on how long you'll wait, your request sits there holding a thread/connection hostage until the caller upstream also times out, or your server runs out of threads.

So the real question is: what's your *policy* for that call? Three ingredients, always together:
1. A **timeout** — never wait forever.
2. A decision on failure — retry (if transient and safe), fail the whole request, or fall back to something else (cached data, a default, a "temporarily unavailable" message for just that piece of the page).
3. Whether repeated failure should **stop you from even trying** for a while (that's what a circuit breaker is for — see [`resilience-patterns.md`](resilience-patterns.md)).

```js
const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
  .catch(() => null); // treat as "unavailable", decide what to do next
```

**Interview line:** *"I never call a dependency without a timeout — an unbounded wait just holds my own resources hostage. Past that, it depends on whether the dependency is critical: if it is, I fail fast and surface the error; if it isn't, I degrade gracefully and serve a fallback instead of failing the whole request."*

**Tests:** timeout discipline, failure classification, blast-radius thinking

*Axis: failure · Source: challenge question*

---

### "How do you prevent cascading failures?"

A cascading failure is dominoes: Service C gets slow → Service B is calling C and now B's requests pile up waiting on C → B runs out of threads/connections → B becomes slow too → Service A calling B now piles up the same way → eventually the whole chain is down, even though only C was ever actually broken.

The fix is that every layer needs to **stop passing the pain upward** instead of just absorbing it until it breaks too:
- **Timeouts** at every hop, so nothing waits forever.
- **Circuit breakers**, so once C is clearly broken, B stops calling it at all and fails fast instead of queuing up behind it.
- **Bulkheads** (below), so C's slowness only exhausts the resources set aside for C, not everything B does.
- **Fallbacks**, so B can often still respond (with degraded data) instead of failing entirely.

**Interview line:** *"Cascading failure is one slow dependency propagating upward because every caller in the chain just waits on it instead of protecting itself. I stop it at each hop with timeouts, circuit breakers, and bulkheads — so a failure stays contained to the layer that's actually broken."*

**Tests:** systems thinking, blast-radius containment

*Axis: failure · Source: challenge question*

---

### "What is a retry storm?"

If every caller retries a failing request 3 times, one failure becomes 3x the load on the dependency that's already struggling — right when it can least handle it. Now stack that across a chain of services that each retry the layer below them: a single failure at the bottom can turn into 10x, 50x, 100x the original traffic hitting a dying service, which guarantees it stays dead (or takes down services around it too). That amplification is a retry storm — the retry logic that's supposed to help availability ends up being a self-inflicted denial-of-service attack on your own system.

The fix is the same combination as always: cap retry attempts, use exponential backoff + jitter so retries don't all land at once, and use a circuit breaker so callers stop retrying altogether once it's clear the failure isn't transient.

**Interview line:** *"A retry storm is when a failure at one layer gets amplified by everyone above it retrying, so the fix isn't 'add more retries' — it's capping retries, backing off with jitter, and using a circuit breaker to stop retrying once the failure looks sustained rather than transient."*

**Tests:** amplification effects, retry safety, systemic thinking

*Axis: scale · Source: challenge question*

---

### "How do you handle partial failures?"

This comes up any time one request does *multiple* independent things — a bulk API, a batch job, a fan-out to several services. Some of those things succeed, some fail. Treating it as strictly all-or-nothing is often wrong, because the failures might be unrelated to each other (item #37 in a 1,000-item CSV import has bad data; that shouldn't roll back the other 999).

The honest response is to report **per-item status**, not one blanket success/failure:
```json
{
  "succeeded": [1, 2, 3, 5],
  "failed": [{ "id": 4, "reason": "invalid email" }]
}
```
REST has `207 Multi-Status` for exactly this. The caller can then retry just the failed subset instead of redoing everything.

**Interview line:** *"For a bulk or multi-step operation, I don't collapse the result into one success/failure — I return per-item status, because the failures are often independent and shouldn't block what succeeded. The client can then retry just the failed subset."*

**Tests:** bulk-operation design, honest error reporting

*Axis: failure · Source: challenge question*

---

### "How do you design graceful degradation?"

Not every dependency your request touches is equally important. On a product page, the product name/description/images are essential; "you might also like…" recommendations are not. If the recommendations service is down, failing the *entire page* over it is a self-inflicted outage for something the user didn't even need.

The pattern: identify what's actually essential for this response vs what's a nice-to-have, wrap the non-essential calls so their failure can't take down the whole response, and serve a reasonable fallback (cached value, empty state, "unavailable right now") for the part that failed.

```js
const [product, recommendations] = await Promise.allSettled([
  getProduct(id),          // essential — if this fails, the request fails
  getRecommendations(id),  // optional — if this fails, just omit the section
]);
if (product.status === 'rejected') throw product.reason;
```

**Interview line:** *"I split a request's dependencies into essential and optional. Essential failures fail the request. Optional ones degrade — I serve a fallback or just omit that part of the response instead of failing the whole thing over something the user didn't strictly need."*

**Tests:** prioritization, fault isolation, user-facing trade-offs

*Axis: failure · Source: challenge question*

---

### "What is bulkheading and when would you use it?"

Named after a ship's watertight compartments — a hull breach floods *one* compartment, not the whole ship, because the compartments are sealed off from each other. Same idea in software: if all your outgoing calls share one connection pool or one thread pool, a single slow dependency can fill that shared pool with calls stuck waiting on it — and now calls to every *other*, perfectly healthy dependency are starved too, because there's no capacity left.

A bulkhead means giving each dependency (or each class of work) its **own** isolated pool of resources — its own connection pool, its own thread pool, its own concurrency limit — so if one dependency backs up, only its own pool fills up. Everything else keeps working.

**Interview line:** *"Bulkheading means isolating resources per-dependency — separate connection or thread pools — so one slow dependency can only exhaust its own pool, not starve calls to everything else. Without it, a single bad dependency can take down completely unrelated functionality just by hogging the shared pool."*

**Tests:** resource isolation, blast-radius containment

*Axis: failure · Source: challenge question*

---

### "How do you handle network timeouts? How do you choose timeout values?"

A timeout is your answer to "how long am I willing to hold a resource hostage waiting for this call?" No timeout means unbounded — a hung dependency can eventually starve you of every thread/connection you have.

Choosing the value isn't a guess — it should be based on the dependency's actual measured latency (p95/p99), plus some margin, not a round number picked out of the air:
- **Too short** → you time out calls that were just slow, not broken, and now you're retrying (or failing) things that would've succeeded.
- **Too long** → a truly broken dependency ties up your resources far longer than necessary, and you're slow to detect and react to the failure.

Different call paths deserve different timeouts — a background job can tolerate a much longer wait than a user-facing request, because nobody's staring at a spinner for it.

**Interview line:** *"I never leave a network call unbounded. I set the timeout based on the dependency's actual measured p99 latency plus margin — not a guess — because too tight causes false failures on merely-slow calls, and too loose means a truly dead dependency ties up my resources far longer than it should."*

**Tests:** operational judgment, measurement-driven decisions

*Axis: failure · Source: challenge question*

---
