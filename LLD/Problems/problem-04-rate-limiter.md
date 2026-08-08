# LLD Problem 04 — Rate Limiter (class design)

> Worked end-to-end using the **[LLD Problem-Solving Framework](../04-lld-problem-solving-framework.md)**. Signature challenge: pluggable algorithm via clean interfaces. Contrast: **[../../System-design/23-rate-limiting.md](../../System-design/23-rate-limiting.md)** covers the ALGORITHM at system/Redis scale; this file is the CLASS design — interfaces, where state lives, how a caller swaps strategies without changing calling code.

---

## Table of Contents

1. [Requirements & Scope](#requirements)
2. [Actors & Entities](#actors)
3. [Class Design](#class-design)
4. [Patterns Applied](#patterns)
5. [Core Code](#code)
6. [Concurrency](#concurrency)
7. [Extensibility](#extensibility)
8. [Interview Q&A](#interview)
9. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements & Scope

**Functional:**
1. Limit requests from a caller (user or IP) to **N per time window**.
2. Support **multiple algorithms** — fixed window, sliding window, token bucket — as **interchangeable** implementations behind one call site.
3. Support **per-user** limiting (`allowRequest(userId)`) and **global** limiting (one shared budget, e.g. "no more than 50/sec to a downstream").

**Non-functional:**
- A caller must be able to swap the algorithm (fixed window → token bucket) **without changing the line that calls it**. This is the whole point of the exercise.
- The counter/bucket state must stay correct under **concurrent requests for the same key**.
- The design must not hardcode "state lives in a local `Map`" — it should be just as easy to later back it with Redis without touching callers.

> **This file vs. [23-rate-limiting.md](../../System-design/23-rate-limiting.md):** that file answers *"which algorithm, and how does it survive 10 app servers behind a load balancer?"* — token bucket vs sliding window trade-offs, Redis `INCR`, Lua scripts, fail-open/fail-closed. This file answers a narrower, more OOP question the HLD file doesn't touch: *"given you've picked an algorithm (or want to support three), how do you shape the **classes** so `allowRequest()` doesn't care which one is running underneath, and a new algorithm is one new class, not a rewrite?"* Same domain, different altitude — HLD file assumes the algorithm as a black box; this file builds the box.

---

<a name="actors"></a>
# 2. Actors & Entities

| Entity | Role |
|---|---|
| **`RateLimiter`** | Interface/abstract base — the contract every algorithm implements: `allowRequest(key)`. |
| **`FixedWindowLimiter`** | Concrete strategy — one counter per fixed time bucket. |
| **`SlidingWindowLimiter`** | Concrete strategy — current + previous window, weighted (sliding window counter). |
| **`TokenBucketLimiter`** | Concrete strategy — bucket of tokens, refilled over time. |
| **`RateLimiterFactory`** | Builds the right concrete limiter from a config, so callers never say `new TokenBucketLimiter(...)` directly. |
| **`RateLimiterRegistry`** | Owns the per-key state map (`userId → limiter state`); the thing that actually holds shared, mutable state. |
| **`Client` / caller** | Middleware, controller, or service that calls `limiter.allowRequest(userId)` before doing real work. |

---

<a name="class-design"></a>
# 3. Class Design

**Strategy pattern**: one interface, three interchangeable algorithm implementations. The registry is the *shared state holder*; the limiter is *stateless logic* that operates on whatever state the registry hands it.

```
                     ┌───────────────────────┐
                     │   «interface»          │
                     │   RateLimiter          │
                     │───────────────────────│
                     │ + allowRequest(key)    │
                     │     : boolean          │
                     └───────────△────────────┘
                                 │ implements
        ┌────────────────────────┼────────────────────────┐
        │                        │                         │
┌───────────────────┐  ┌──────────────────────┐  ┌───────────────────┐
│ FixedWindowLimiter │  │ SlidingWindowLimiter  │  │ TokenBucketLimiter │
│────────────────────│  │───────────────────────│  │────────────────────│
│ - windowMs         │  │ - windowMs             │  │ - capacity         │
│ - limit            │  │ - limit                │  │ - refillPerSec     │
│ - state: Map        │  │ - state: Map           │  │ - state: Map        │
│ + allowRequest()   │  │ + allowRequest()       │  │ + allowRequest()    │
└───────────────────┘  └──────────────────────┘  └───────────────────┘

┌────────────────────────┐        creates        ┌───────────────────────┐
│  RateLimiterFactory     │ ─────────────────────▶│  a RateLimiter         │
│  + create(type, config) │                        │  (one of the 3 above)  │
└────────────────────────┘                        └───────────────────────┘

┌───────────────────────────────────────────┐
│ RateLimiterRegistry                        │
│─────────────────────────────────────────── │
│ - limiter: RateLimiter   (injected)         │
│ - perKeyState: Map<userId, LimiterState>    │
│ + isAllowed(userId): boolean                │
└───────────────────────────────────────────┘

Client ──allowRequest(userId)──▶ RateLimiterRegistry ──delegates──▶ RateLimiter (whichever strategy)
```

Key relationship: **`RateLimiterRegistry` has-a `RateLimiter`** (composition, injected at construction) — it never knows which concrete algorithm it's holding. Swap the injected instance, nothing else in the codebase changes.

---

<a name="patterns"></a>
# 4. Patterns Applied

## Strategy — the central pattern here
`RateLimiter` is the strategy interface; `FixedWindowLimiter` / `SlidingWindowLimiter` / `TokenBucketLimiter` are interchangeable strategies. The middleware that calls `registry.isAllowed(userId)` has **zero knowledge** of which algorithm runs underneath.

Ties directly to **Open/Closed**: to add a new algorithm (say, leaky bucket), you write a new class that implements `RateLimiter` and register it in the factory. **Nothing that already exists — the registry, the middleware, the other two limiters — is modified.** That's the textbook OCP payoff: open for extension (new class), closed for modification (no edits to working code).

## Factory
`RateLimiterFactory.create(type, config)` centralizes the "which concrete class for which config" decision in one place, so `RateLimiterRegistry` and callers depend only on the `RateLimiter` interface, never on a concrete constructor. Also the one place that changes when a new algorithm is added.

## Singleton — should `RateLimiterRegistry` be one?
**The pull toward yes:** the whole point of a rate limiter is a *shared* counter — if two different `RateLimiterRegistry` instances exist in the same process, each thinks it owns the count, and the limit becomes 2× too loose (the exact same bug as per-server in-memory counters at HLD scale, just one level down). A Singleton guarantees "there is exactly one source of truth in this process."

**The trade-offs:**
- ❌ Hides a dependency — code that calls a global singleton is harder to unit-test (state leaks between tests unless you add a `reset()` escape hatch).
- ❌ Doesn't actually solve the distributed case — the moment you run more than one process, "one instance per process" is no longer "one instance," and you need Redis anyway (see [23-rate-limiting.md §6](../../System-design/23-rate-limiting.md#distributed)). Singleton only buys you correctness *within* a single process.
- ✅ Pragmatic middle ground: don't bake in a hard global singleton; construct **one instance** at app startup and inject it (DI) everywhere that needs `allowRequest`. Same "one shared instance" guarantee, without a hardcoded global — and it composes cleanly with the Redis-backed limiter in §7, where the "single source of truth" moves from process memory to Redis anyway.

---

<a name="code"></a>
# 5. Core Code (JavaScript ES6)

```javascript
// ---- The interface (duck-typed base class) ----
class RateLimiter {
  /** @returns {boolean} true if the request is allowed */
  allowRequest(key) {
    throw new Error('allowRequest() must be implemented by a subclass');
  }
}

// ---- Token Bucket ----
class TokenBucketLimiter extends RateLimiter {
  constructor(capacity, refillPerSec) {
    super();
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.state = new Map(); // key -> { tokens, lastRefillMs }
  }

  #refill(bucket, now) {
    const elapsedSec = (now - bucket.lastRefillMs) / 1000;
    const refreshed = elapsedSec * this.refillPerSec;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refreshed);
    bucket.lastRefillMs = now;
  }

  allowRequest(key) {
    const now = Date.now();
    let bucket = this.state.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillMs: now };
      this.state.set(key, bucket);
    }
    this.#refill(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;      // consume — read+write must stay together, see §6
      return true;
    }
    return false;
  }
}

// ---- Sliding Window Counter ----
class SlidingWindowLimiter extends RateLimiter {
  constructor(limit, windowMs) {
    super();
    this.limit = limit;
    this.windowMs = windowMs;
    this.state = new Map(); // key -> { windowStart, currCount, prevCount }
  }

  allowRequest(key) {
    const now = Date.now();
    let w = this.state.get(key);
    if (!w) {
      w = { windowStart: now, currCount: 0, prevCount: 0 };
      this.state.set(key, w);
    }

    const elapsed = now - w.windowStart;
    if (elapsed >= this.windowMs) {
      // roll the window forward (handles >1 window of idle time too)
      const windowsPassed = Math.floor(elapsed / this.windowMs);
      w.prevCount = windowsPassed === 1 ? w.currCount : 0;
      w.currCount = 0;
      w.windowStart += windowsPassed * this.windowMs;
    }

    const overlap = 1 - (now - w.windowStart) / this.windowMs;
    const estimate = w.currCount + w.prevCount * overlap;

    if (estimate < this.limit) {
      w.currCount += 1;
      return true;
    }
    return false;
  }
}

// ---- Fixed Window (simplest baseline, boundary-burst prone — see 23-rate-limiting.md) ----
class FixedWindowLimiter extends RateLimiter {
  constructor(limit, windowMs) {
    super();
    this.limit = limit;
    this.windowMs = windowMs;
    this.state = new Map(); // key -> { windowStart, count }
  }

  allowRequest(key) {
    const now = Date.now();
    let w = this.state.get(key);
    if (!w || now - w.windowStart >= this.windowMs) {
      w = { windowStart: now, count: 0 };
      this.state.set(key, w);
    }
    if (w.count < this.limit) {
      w.count += 1;
      return true;
    }
    return false;
  }
}

// ---- Factory ----
class RateLimiterFactory {
  static create(type, config) {
    switch (type) {
      case 'token-bucket':
        return new TokenBucketLimiter(config.capacity, config.refillPerSec);
      case 'sliding-window':
        return new SlidingWindowLimiter(config.limit, config.windowMs);
      case 'fixed-window':
        return new FixedWindowLimiter(config.limit, config.windowMs);
      default:
        throw new Error(`Unknown rate limiter type: ${type}`);
    }
  }
}

// ---- Usage — the caller never names a concrete class ----
const limiter = RateLimiterFactory.create('token-bucket', { capacity: 10, refillPerSec: 1 });
if (!limiter.allowRequest(userId)) {
  return res.status(429).json({ error: 'Too Many Requests' });
}
```

Swap `'token-bucket'` for `'sliding-window'` and the `if (!limiter.allowRequest(userId))` line — and every other line in the app — is untouched. That's Strategy + Factory earning their keep.

---

<a name="concurrency"></a>
# 6. Concurrency

**The race:** `allowRequest()` is a **read-then-write** on shared state (`bucket.tokens`, or `w.currCount`) keyed by `userId`. Two concurrent requests for the *same* user can both read `tokens = 1`, both decide "allowed," both write `tokens = 0` — one request that should've been rejected got through. Classic **lost-update** race, identical in shape to the HLD-level race in [23-rate-limiting.md §6](../../System-design/23-rate-limiting.md#distributed) ("two servers both read 99, both allow").

**Why plain Node.js mostly dodges it:** the code above has no `await` between the read and the write inside `allowRequest()`, and JS is single-threaded per event-loop tick — so the whole read-modify-write runs as one uninterruptible unit *as long as it stays synchronous*. The moment a network hop is introduced (e.g. checking a remote store before mutating), an `await` opens a gap where another request for the same key can interleave — the race reappears.

**Fixes, in order of where the state lives:**
1. **In-process, single instance:** keep the critical section synchronous (as above), or if it must be async, take a **per-key mutex** (e.g. a `Map<key, Promise>` queue) — never a single global lock, or unrelated users needlessly serialize behind each other.
2. **In-process, multi-threaded runtime (Java/Go):** a `synchronized` block or lock **scoped to the key**, same reasoning — lock granularity per-user, not per-registry.
3. **Multi-process / distributed:** local locks can't help — this is exactly where the class design's contract pays off. `allowRequest(key)` stays the same method signature; only the *implementation* changes to delegate to Redis `INCR` (atomic by itself) or a Lua script for check-and-increment (see [23-rate-limiting.md §6](../../System-design/23-rate-limiting.md#distributed) for why Lua is needed for token-bucket-style logic that's more than a single `INCR`). The calling code — middleware, `RateLimiterRegistry` — never learns the difference.

---

<a name="extensibility"></a>
# 7. Extensibility

## "Now add a per-endpoint limit in addition to per-user"
Two ways, both **without touching `TokenBucketLimiter` or its siblings**:
- **Composite key:** the registry keys state by `` `${userId}:${endpoint}` `` instead of just `userId`. Zero class changes — just a key-construction change at the call site.
- **Composed limiters:** a small `AndLimiter implements RateLimiter` that holds two `RateLimiter`s (one keyed per-user, one keyed per-endpoint) and returns `true` only if **both** allow. This is Strategy composed with itself — still no edits to the three concrete algorithm classes.

## "Now add a distributed version backed by Redis"
Add **one new class**, `RedisTokenBucketLimiter implements RateLimiter`, whose `allowRequest(key)` runs a Lua script against Redis instead of touching a local `Map`. Register it in `RateLimiterFactory`. That's the entire diff.

**What changes:** the factory (one new `case`), and — because a network hop is now involved — the interface method becomes `async allowRequest(key): Promise<boolean>` instead of a synchronous `boolean`. That's the one contract ripple: if you *anticipate* ever going distributed, design the interface to return a `Promise<boolean>` from day one (even the in-memory versions can trivially wrap a sync value in `Promise.resolve(...)`), so adding Redis later doesn't force every caller to add `await` retroactively.

**What stays untouched:** `FixedWindowLimiter`, `SlidingWindowLimiter`, `TokenBucketLimiter`, the `RateLimiterRegistry` shape, and every call site — they all still just call `allowRequest(key)`. This is the class-design mirror of the HLD move in 23-rate-limiting.md ("swap local counters for Redis `INCR`") — same idea, expressed here as "swap one Strategy implementation."

---

<a name="interview"></a>
# 8. Interview Q&A

### Q: "Why Strategy specifically, and not just an `if/else` on an algorithm-type flag?"
> *"Because the algorithm is exactly the axis that changes — today it's token bucket, tomorrow the interviewer says 'now support sliding window too,' and a flag-driven `if/else` means editing one function every time. Strategy makes each algorithm its own class behind one interface, so adding a new one is a new file, not an edit to existing, tested code — that's the Open/Closed principle in practice."*

### Q: "How do you let a caller swap the algorithm without changing calling code?"
> *"The caller only ever holds a reference typed as the `RateLimiter` interface, and only ever calls `allowRequest(key)`. Which concrete class backs that reference is decided once, at construction time, by a factory. So swapping token bucket for sliding window is a one-line change where the object is constructed — every other line, including the `if (!limiter.allowRequest(userId))` check, is untouched."*

### Q: "How do you keep the counter thread-safe under concurrent requests for the same user?"
> *"It's a read-then-write on shared per-key state, so naive concurrent access is a lost-update race — two requests both read 'under limit,' both get allowed. In a single-threaded runtime like Node, keeping the check-and-update synchronous (no `await` in between) sidesteps it for free. In a multi-threaded runtime, or once the state moves to Redis for a distributed deployment, you need the update to be atomic — a per-key lock locally, or Redis `INCR` / a Lua script remotely. Locking must be scoped to the key, never a single global lock, or you serialize unrelated users for no reason."*

### Q: "Should the rate limiter's state store be a Singleton?"
> *"There should be exactly one instance per process — two separate registries would each think they own the count and the limit would be twice too loose. But I wouldn't hardcode a global Singleton; I'd construct one instance at startup and inject it everywhere, which gives the same 'one shared instance' guarantee without the testability and hidden-dependency problems a hard Singleton brings. And it's worth saying out loud that a Singleton only solves this within one process — the moment you run multiple processes, you need a shared external store like Redis anyway."*

### Q: "How is this different from the rate limiting you already know at the system-design level?"
> *"The system-design version answers which algorithm to pick and how it survives multiple servers — token bucket for bursty traffic, Redis for a shared atomic counter, Lua scripts to avoid races across the network. This is one layer down: given I'm implementing any of those algorithms, how do I shape the classes so they're interchangeable behind one interface, so 'now add a new algorithm' or 'now make it distributed' is additive, not a rewrite. The HLD file treats the algorithm as a black box; this is what's inside the box."*

### Q: "Now add a per-endpoint limit on top of the per-user one — what changes?"
> *"Nothing in the three algorithm classes. Either I widen the state key to `userId:endpoint`, or I compose two `RateLimiter` instances behind a small `AndLimiter` that requires both to allow. Either way it's an additive change at the registry/composition layer, not a change to `TokenBucketLimiter` itself — which is the same Open/Closed argument as adding a brand-new algorithm."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet

- **Contrast:** [23-rate-limiting.md](../../System-design/23-rate-limiting.md) = which algorithm + Redis at scale (HLD). This file = the classes/interfaces that make the algorithm swappable (LLD).
- **Interface:** `RateLimiter.allowRequest(key): boolean` — every algorithm implements this and nothing else leaks through.
- **Strategies:** `FixedWindowLimiter` (simple, boundary burst) · `SlidingWindowLimiter` (current+prev weighted) · `TokenBucketLimiter` (bucket + refill, bursts allowed).
- **Factory:** `RateLimiterFactory.create(type, config)` — the one place that knows concrete constructors.
- **Registry:** has-a `RateLimiter` (composition, injected) + owns `Map<key, state>` — the shared, mutable part.
- **Central pattern:** Strategy → ties to **Open/Closed** — new algorithm = new class, zero edits elsewhere.
- **Singleton debate:** want one instance per process (shared truth), but inject it rather than hardcode a global; doesn't solve multi-process — that's what Redis is for.
- **Race:** read-then-write on per-key state → lost update. Fix: keep critical section sync (single-threaded runtime), or per-key lock/mutex, or atomic remote op (Redis `INCR`/Lua) once distributed.
- **Extend — per-endpoint:** composite key or `AndLimiter` composition; algorithm classes untouched.
- **Extend — distributed:** new `RedisXLimiter implements RateLimiter`; interface goes `Promise<boolean>`; factory gets one new case; callers untouched.

*— LLD Problem 04 complete —*
