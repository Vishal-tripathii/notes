# System Design Study Notes — Part 23

## Rate Limiting & Throttling (Token Bucket, Sliding Window, Distributed with Redis)

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams, the five algorithms, the distributed problem, and interview Q&A included.
>
> **Continues:** builds on Part 2.5 (load balancer) & Part 2.6 (reverse proxy — where the limiter lives), Part 5.5 (Redis — the shared counter store), and Part 6 (headers — 429 & Retry-After). Ties to Part 13 (idempotency mindset for retries).

---

## Table of Contents

1. [The problem: why rate limit at all](#problem)
2. [Analogy + definition](#analogy)
3. [First question: limit *whom*? (the key)](#key)
4. [The five algorithms](#algorithms)
5. [Where does the limiter live?](#where)
6. [The distributed problem (Redis + atomicity)](#distributed)
7. [What you send back (429, Retry-After, headers)](#response)
8. [Interview questions & answers](#interview)
9. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="problem"></a>
# 1. The problem: why rate limit at all

A single client can hammer your API far faster than any human would. Without a cap:

1. **Abuse / DoS** — one script sends 10,000 req/sec, starving every other user.
2. **Cost** — every request burns CPU, DB connections, and (if you call paid downstream APIs) real money.
3. **Fairness** — one greedy client shouldn't degrade the service for the other 10,000.
4. **Accidental self-harm** — a buggy client stuck in a retry loop can take you down with no malice at all.
5. **Security** — brute-forcing passwords/OTPs, credential stuffing, scraping.

> Fix: cap how many requests a client may make per time window. Over the limit → reject **cheaply** (never start the expensive work) with **HTTP 429 Too Many Requests**.

---

<a name="analogy"></a>
# 2. Analogy + definition

## Analogy: the nightclub bouncer 🚪
A club posts "max 100 people/hour." The **bouncer** (rate limiter) counts entries. Once the cap is hit, everyone else waits outside — the club (your servers) never gets dangerously overcrowded, and the people already inside still have a good time.

## Definition
**Rate limiting caps the number of requests a client can make in a given time window; requests over the cap are rejected cheaply with a 429.**
```
Client ──requests──▶ [ Rate Limiter ] ──under limit──▶ [ App / DB ]  ✅ do the work
                            │
                            └──over limit──▶ 429 Too Many Requests   ✋ reject cheaply
```
> **Rate limiting** (hard cap: reject over N) vs **throttling** (slow down / smooth the rate rather than hard-reject). Same family; the terms are often used interchangeably.

---

<a name="key"></a>
# 3. First question: limit *whom*? (the key)

Before *how*, decide *what you count per* — the **rate-limit key**:

- **Per API key / user ID** — best for authenticated APIs. Fair and precise.
- **Per IP address** — for anonymous traffic (login, signup). Blunt: whole offices/universities share one IP behind NAT (you can block many real users at once), and attackers rotate IPs to dodge it.
- **Per endpoint** — `POST /login` gets a tight limit (5/min); `GET /products` a loose one (1000/min).
- **Global** — protect a fragile downstream ("no more than 50 req/sec to the payment provider, total").

> Real systems **combine** these: *"100 req/min per user, AND 10 login attempts/min per IP."*

---

<a name="algorithms"></a>
# 4. The five algorithms

Built up simplest → best.

## (a) Fixed Window Counter
Divide time into fixed buckets (each calendar minute). Count requests in the current bucket; reset to 0 at the next bucket.
```
Limit = 5 / minute
10:00:00 ──────────── 10:00:59  | 10:01:00 ──────────── 10:01:59
   count: 1,2,3,4,5,✗,✗          |    count resets → 1,2,3...
```
- **Pro:** dead simple, one counter (`INCR`), tiny memory.
- **Con — the boundary burst 🔥:** limit 5/min, but a client sends 5 at `10:00:59` and 5 more at `10:01:00` → **10 requests in ~1 second**, and both windows think they're fine. Up to **2× the limit** across a boundary.

## (b) Sliding Window Log
Store a **timestamp for every request** (e.g. a Redis sorted set). On each request, drop timestamps older than "now − window", then count what's left.
```
Window = 60s, limit = 5.  Now = 10:01:30.
Log: [10:00:40, 10:00:55, 10:01:10, 10:01:25]  ← drop anything before 10:00:30
Count = 4 < 5 → allow, append 10:01:30.
```
- **Pro:** perfectly accurate, no boundary burst — a true rolling window.
- **Con:** stores **one entry per request** → memory-heavy for hot keys (1000 req/min = 1000 timestamps held).

## (c) Sliding Window Counter — the practical winner ⭐
Hybrid that approximates the log cheaply. Keep the count for the **current** and **previous** fixed windows; weight the previous by how much of it still overlaps the rolling window.
```
Limit = 100/min. We're 30% into the current minute (70% of prev window still counts).
prev count = 80, current count = 20.
estimate = current + prev × (1 − 30%) = 20 + 80 × 0.7 = 76  → under 100, allow.
```
- **Pro:** near-log accuracy with only **two counters** per key; smooths the boundary burst. What most production systems (e.g. Cloudflare) actually use.
- **Con:** slight approximation (assumes even spread within the previous window) — negligible in practice.

## (d) Token Bucket — the one to name in interviews 🪣
A bucket holds up to **N tokens**. Tokens **refill at a steady rate** (e.g. 10/sec). Each request **removes one token**. No token → reject.
```
Capacity = 10, refill = 1 token/sec.
Bucket full (10) → burst of 10 requests allowed instantly (drains bucket).
Then throttled to ~1/sec as tokens trickle back in.
```
- **Pro:** **allows controlled bursts** while enforcing a long-run average — matches real (bursty) traffic. Stores only `token_count` + `last_refill_timestamp` per key → tiny. Used by AWS, Stripe.
- **Mental model:** capacity = how big a burst you tolerate; refill rate = your sustained throughput.

## (e) Leaky Bucket — smooth output
Requests enter a **queue (bucket)**; they **leak out at a fixed rate** to be processed. Bucket full → new requests dropped.
```
Requests in (bursty) → [ queue ] → leak out at fixed 10/sec (smooth) → processed
```
- **Pro:** guarantees a **perfectly smooth, constant** outflow — great when the *downstream* needs steady load (fragile DB).
- **Con:** no bursting (opposite of token bucket); adds queueing latency; needs a queue.

## Token bucket vs leaky bucket (the classic confusion)
- **Token bucket** — allows bursts up to capacity; shapes *input allowance*.
- **Leaky bucket** — forces a smooth constant rate, forbids bursts; shapes *output rate*.

## Quick pick
| Want | Use |
|---|---|
| Sensible default (bursts + tiny state) | **Token bucket** |
| Strict "N per rolling window" accuracy | **Sliding window counter** |
| Perfectly smooth downstream load | **Leaky bucket** |
| Simplest possible, boundary burst OK | **Fixed window** |
| Exact accuracy, memory no object | **Sliding window log** |

---

<a name="where"></a>
# 5. Where does the limiter live?

```
Client → [ API Gateway / Load Balancer ] → [ App servers ] → DB
              ▲ rate limit HERE (ideal)        ▲ or here
```
- **At the edge (API gateway / reverse proxy — Nginx, Kong, Cloudflare, AWS API Gateway):** best. Rejects abusive traffic *before* it touches app servers or DB — the expensive work is never started. (Ties to Part 2.6 reverse proxy, Part 2.5 load balancer.)
- **In the application:** more flexible (per-user business rules), but the request already consumed a connection to get there.

---

<a name="distributed"></a>
# 6. The distributed problem (the real interview trap ⚠️)

You have **10 app servers** behind a load balancer. If each keeps its counter in **local memory**, the limit is effectively **10× too loose** — a user hitting different servers gets N requests *per server*.
```
Limit "100/min per user", but counter is per-server:
Server1: 100   Server2: 100 ... Server10: 100  →  user actually got 1000. ❌
```

## Fix: a shared, centralized store — almost always Redis
All servers `INCR`/check the **same** counter. Redis is chosen because it's in-memory (sub-ms), atomic, and has a built-in **TTL** so window counters auto-expire. (Ties to Part 5.5 Redis.)

## Two subtleties they love to probe
1. **Atomicity / race condition** — "read count → check → increment" across many servers races: two servers both read 99, both allow, count hits 101. **Fix:** make it atomic — Redis `INCR` is atomic, or run a **Lua script** that does check-and-increment in one step so no interleaving is possible.
2. **Redis is now a dependency** — adds a ~1ms network hop and is a potential single point of failure. Mitigate with a cluster/replica, and choose a policy if Redis is down:
   - **Fail-open** — allow all traffic (availability > protection). Usual choice for general APIs.
   - **Fail-closed** — block traffic (protection > availability). For security-critical paths like login.

---

<a name="response"></a>
# 7. What you send back (the response)

- **Status: `429 Too Many Requests`.**
- **`Retry-After: 30`** — tells the client to wait 30s before retrying (be a good API citizen). (Ties to Part 6 headers.)
- Informational headers so clients can self-throttle:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 0`
  - `X-RateLimit-Reset: 1690000060` (when the window resets)

> Reject **cheaply**: a 429 must cost almost nothing — no DB call, no heavy work — or the limiter itself becomes the bottleneck.

---

<a name="interview"></a>
# 8. Interview questions & answers

### Q: "Why do you need rate limiting?"
> *"To prevent abuse, control cost, and ensure fairness. Without it, one client — malicious or just buggy in a retry loop — can flood the API, starve every other user, run up cost, and even take the system down. Rate limiting caps requests per client per time window and rejects the excess cheaply with a 429, so abusive traffic never consumes the expensive resources."*

### Q: "Which algorithm would you use?"
> *"Token bucket is my default: it allows short bursts up to a capacity while capping the long-run average, which matches real bursty traffic, and it stores almost nothing — just a token count and last-refill timestamp. If I need strict 'N per rolling window' accuracy without the boundary-burst problem, I use a sliding window counter, which keeps just the current and previous window counts. Fixed window is simplest but allows up to 2× the limit across a boundary; sliding window log is exact but stores a timestamp per request, so it's memory-heavy."*

### Q: "What's the boundary burst problem?"
> *"With a fixed window counter, the count resets at each window boundary. So a client can send the full limit at the very end of one window and the full limit again at the start of the next — twice the limit in a tiny span, and neither window notices. Sliding window (log or counter) fixes it by measuring a rolling window instead of resetting at fixed edges."*

### Q: "Token bucket vs leaky bucket?"
> *"Token bucket allows bursts: tokens refill at a steady rate and accumulate up to a capacity, so a client can spend a saved-up burst and then is throttled to the refill rate. Leaky bucket forces a perfectly smooth constant output: requests queue and leak out at a fixed rate, no bursting allowed. So token bucket when I want to tolerate bursts, leaky bucket when the downstream needs a steady, smooth load."*

### Q: "How do you rate limit across many servers?"
> *"You can't use per-server in-memory counters — with 10 servers the limit becomes 10× too loose, because a user hitting different servers gets the full limit on each. I keep the counter in a shared store, almost always Redis: it's in-memory and fast, atomic, and has TTLs so window counters auto-expire. All servers increment the same key."*

### Q: "Isn't there a race condition on that shared counter?"
> *"Yes — a naive read-check-increment can interleave, so two servers both read 99, both allow, and the count overshoots. I make the check-and-increment atomic: Redis `INCR` is atomic on its own, or I run a small Lua script that reads, checks, and increments in a single atomic step so no two requests can interleave."*

### Q: "What if Redis goes down?"
> *"Redis becomes a dependency and a potential single point of failure, so I run it clustered/replicated and decide a failure policy. Fail-open — allow traffic when Redis is unavailable — favors availability and suits general APIs. Fail-closed — block traffic — favors protection and suits security-critical paths like login. The choice is a deliberate availability-vs-protection trade-off."*

### Q: "What do you return when a client is over the limit?"
> *"HTTP 429 Too Many Requests, with a Retry-After header telling the client how long to wait, and optionally X-RateLimit-Limit/Remaining/Reset headers so well-behaved clients can self-throttle. And the rejection has to be cheap — no DB work — otherwise the limiter itself becomes a bottleneck under attack."*

---

<a name="cheatsheet"></a>
# 9. Cheat Sheet — everything on one page

### Core
- **Rate limiting** = cap requests per client per time window; reject excess cheaply with **429**.
- Why: abuse/DoS · cost · fairness · accidental self-harm · security (brute force).
- Analogy: nightclub bouncer counting entries against a max.

### The key (limit whom?)
Per user/API key (best, precise) · per IP (anonymous, blunt — NAT + IP rotation) · per endpoint · global. Often combined.

### Algorithms
| Algorithm | State | Bursts | Accuracy | Note |
|---|---|---|---|---|
| Fixed window | 1 counter | — | low | boundary burst → up to 2× limit |
| Sliding window log | 1 ts/request | — | exact | memory-heavy |
| **Sliding window counter** ⭐ | 2 counters | — | near-exact | smooths boundary; Cloudflare-style |
| **Token bucket** 🪣 | count + timestamp | ✅ | avg | default; bursts + tiny state (AWS/Stripe) |
| Leaky bucket | queue | ❌ | smooth output | steady downstream rate |

- **Token bucket:** capacity = burst size; refill rate = sustained throughput.
- **Token vs leaky:** token allows bursts (shapes input allowance); leaky forces smooth constant rate (shapes output).

### Where
At the **edge** (API gateway / reverse proxy) is best — reject before it hits app/DB. Or in-app for per-user business rules.

### Distributed (the trap)
- Per-server in-memory counters → limit × server-count (too loose). ❌
- Use a **shared store — Redis** (in-memory, atomic, TTL).
- **Atomicity:** `INCR` or a **Lua script** for atomic check-and-increment (avoid the read-check-incr race).
- **Redis down:** **fail-open** (availability, general APIs) vs **fail-closed** (protection, login).

### Response
- `429 Too Many Requests` + `Retry-After: 30`.
- `X-RateLimit-Limit / -Remaining / -Reset` for self-throttling.
- Reject **cheaply** — no DB, no heavy work.

### Connects to
- Part 2.5/2.6: limiter lives at the load balancer / reverse proxy (the edge).
- Part 5.5: Redis as the shared, atomic, TTL'd counter store.
- Part 6: 429 + Retry-After + X-RateLimit-* headers.
- Part 13: retries after 429 → idempotency mindset.

### Suggested next topics
- **Consistent hashing** (referenced by sharding, Part 21).
- **Observability** — logging, metrics, tracing, health checks.
- **Idempotency & Saga** — distributed transactions (extends Part 13).

*— End of Part 23 —*
