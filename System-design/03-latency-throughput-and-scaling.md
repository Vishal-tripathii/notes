# System Design Study Notes — Part 3

## Latency & Throughput + Horizontal & Vertical Scaling

> **Format:** Written as **Q&A** — my prompts are the questions, the explanations are the answers. Complete capture of the chat, reorganized and expanded. Diagrams + analogies + rehearsed interview scripts included.
>
> **Continues from:** Part 2 (Scalability). Latency & throughput are the two numbers that define *performance*; scaling is what you do to improve them.

---

## Table of Contents

1. [Latency & Throughput](#latency-throughput)
2. [Horizontal & Vertical Scaling (performance focus)](#scaling)
3. [Recommended Practices](#practices)
4. [Rehearsed Interview Answers](#interview)
5. [Cheat Sheet — everything on one page](#cheatsheet)

---

<a name="latency-throughput"></a>
# 1. Latency & Throughput

## Latency — how long one thing takes
**Latency is the time it takes for a single request to complete** — from asking to getting the answer. Measured in **time**: milliseconds (ms), sometimes microseconds or seconds.

> Lower latency = faster feel. "This page loaded in 80ms" is a latency statement.

## Throughput — how much you can do per unit time
**Throughput is how many requests the system can handle per unit of time.** Measured in **things per second**: requests/second (RPS), queries/second (QPS), transactions/second (TPS).

> Higher throughput = more capacity. "This server handles 10,000 requests/second" is a throughput statement.

---

## The analogy that makes it click: a highway 🛣️
*(memorize this — interviewers love it)*

- **Latency** = how long it takes **one car** to travel start → end of the highway.
- **Throughput** = how many **cars** pass through per **minute**.

Why they're **different**:
- **150 mph limit, 1 lane** → each car fast (**low latency**) but few pass per minute (**low throughput**).
- **30 mph limit, 20 lanes** → each car slow (**high latency**) but tons pass per minute (**high throughput**).

> 👉 **Crucial insight:** latency and throughput are **related but independent**. A system can be fast per-request but low-capacity, or high-capacity but slow per-request. You optimize them differently.

---

## Another analogy: a coffee shop ☕
- **Latency** = how long **you** wait for your one coffee.
- **Throughput** = how many coffees the shop serves **per hour**.

Adding a second barista (scaling out) doesn't make *your* coffee brew faster (latency ~same) — but the shop serves **twice as many** per hour (throughput doubles).

> **Key truth:** adding servers usually improves **throughput more than latency**.

---

## How they relate (the nuances)
1. **Not the same thing** — improving one doesn't automatically improve the other.
2. **Low latency ≠ high throughput** — one fast lane is still one lane.
3. **Latency affects throughput under load** — if each request holds a server busy longer (high latency), the server handles fewer concurrent requests (lower throughput). Faster requests free capacity.
4. **Throughput has a ceiling; past it, latency explodes** — when requests arrive faster than the system processes them, they **queue**. Queued requests wait → latency shoots up. This is why an overloaded site feels *slow* right before it starts *failing*.

```
Requests arriving  ──▶ [ queue ]  ──▶ [ server processes ]
                          ▲
              When arrival rate > throughput,
              the queue grows → each request waits longer → LATENCY SPIKES
```

---

## Measuring latency properly: percentiles (p50, p99)
Never use a single average — averages hide pain. Use **percentiles**:
- **p50 (median)** — 50% of requests are faster than this. The "typical" experience.
- **p99** — 99% are faster than this. The "worst 1%" experience.

> **Why p99 matters:** if p50 is 20ms but p99 is 2000ms, 1 in 100 users has a *terrible* experience. At scale (millions of requests) that 1% is huge. Interviewers ask about **tail latency** (p99, p999) — that's where real systems hurt.

---

## The latency ↔ throughput trade-off (batching)
- Process requests **one at a time** → handled immediately → **low latency**, lower throughput (per-request overhead).
- **Batch** many and process in bulk → **high throughput** (efficient), but each request waits for the batch → **higher latency**.

> Example: a DB writing every record instantly = low latency. Batching 1,000 writes and flushing together = far higher throughput, but each write waits. **You trade latency for throughput, or vice versa.** Chat app → low latency; analytics pipeline → high throughput.

---

<a name="scaling"></a>
# 2. Horizontal & Vertical Scaling (performance focus)

*(Met in Part 2 — here sharpened and tied to latency/throughput.)*

## Vertical scaling ("scale up") — bigger machine
Add CPU/RAM/faster disk to the existing server.
- ✅ Can improve **both latency AND throughput** — faster CPU handles each request quicker (latency ↓) *and* more at once (throughput ↑).
- ❌ Hard **ceiling** (biggest machine you can buy), **expensive**, **single point of failure**.

## Horizontal scaling ("scale out") — more machines
Add more servers behind a load balancer.
- ✅ Primarily improves **throughput** — more machines = more total capacity.
- ⚠️ Doesn't directly reduce **per-request latency** — one request takes the same time on any single machine. (Indirectly helps latency by preventing overload-queuing.)
- ✅ **Fault tolerant**, near-unlimited growth.
- ❌ Complexity: needs **stateless** servers + load balancer + data sync (all of Part 2).

---

## Analogies
| Scaling | Analogy |
|---|---|
| **Vertical** | Give your one cook a bigger stove, sharper knives, more arms → same cook, more powerful |
| **Horizontal** | Hire more cooks → many cooks sharing the work |

## Comparison
| | **Vertical (scale up)** | **Horizontal (scale out)** |
|---|---|---|
| Method | Bigger machine | More machines |
| Helps latency? | ✅ Yes (faster per request) | ⚠️ Indirectly (avoids queuing) |
| Helps throughput? | ✅ Yes (to the ceiling) | ✅✅ Yes (main strength) |
| Limit | Hardware ceiling | Practically unlimited |
| Failure | Single point of failure | Survives node loss |
| Complexity | Simple | Needs LB + statelessness + sync |
| Cost | Expensive at the top | More linear |

## Trade-offs (honest picture)
- **Vertical:** simple, quick win, no architecture change — but you *will* hit the ceiling, and one machine dying = total outage. Good early-stage move.
- **Horizontal:** scales forever + fault tolerant — but you pay in **complexity** (stateless design, load balancing, data synchronization, eventual-consistency headaches). Necessary at large scale.

> **Migration story:** almost every system starts vertical (simple), then goes horizontal at the ceiling or for high availability. Often you do **both**: scale each machine up to a sane size *and* run many of them.

---

<a name="practices"></a>
# 3. Recommended Practices

## For latency
1. **Cache aggressively** — serve repeat reads from memory (Redis) so they never hit the slow DB. Biggest single latency win for read-heavy systems.
2. **Use a CDN** — serve static content/media from a server physically near the user (cuts network latency).
3. **Put the database close + index it well** — most latency hides in slow queries.
4. **Do work asynchronously** — push slow tasks (emails, image processing) to a **queue** so the user isn't kept waiting.
5. **Measure p99, not averages** — optimize the tail.

## For throughput
1. **Scale horizontally** — add stateless servers behind a load balancer.
2. **Batch** where latency allows (bulk DB writes, bulk API calls).
3. **Read replicas** to spread reads; **shard** to spread writes.
4. **Message queue** to absorb spikes — buffers bursts so the system processes at a steady rate instead of collapsing.

## For scaling choices
1. **Start vertical** (simple) → go **horizontal** at the ceiling or for fault tolerance.
2. **Design stateless from day one** (sessions in Redis / JWT) — retrofitting is painful.
3. **Auto-scale** on a metric (CPU/RPS) to match demand and control cost.
4. **Load test** to find your throughput ceiling *before* production traffic does.

---

<a name="interview"></a>
# 4. Rehearsed Interview Answers

*(Word-for-word scripts — practice out loud until natural.)*

### Q: "What's the difference between latency and throughput?"
> *"Latency is how long a single request takes — measured in time, like milliseconds. Throughput is how many requests the system can handle per unit of time — measured in requests per second. The highway analogy: latency is how fast one car crosses; throughput is how many cars pass per minute. They're related but independent — you can have low latency but low throughput (one fast lane), or high throughput but high latency (twenty slow lanes). I optimize latency with caching and CDNs, and throughput by scaling out and batching."*

### Q: "How do you measure latency?"
> *"I use percentiles, not averages, because averages hide the worst cases. p50 is the median — the typical user. p99 is the tail — the worst 1%. At scale, that 1% is millions of requests, so I optimize the tail. If p50 is 20ms but p99 is 2 seconds, one in a hundred users is having a bad time, and that's what I'd focus on."*

### Q: "Vertical vs. horizontal scaling — which would you choose?"
> *"Vertical scaling means a bigger machine — simple, no code changes, improves both latency and throughput, but it has a hardware ceiling and is a single point of failure. Horizontal scaling means more machines behind a load balancer — it scales throughput almost without limit and gives fault tolerance, but requires stateless servers, load balancing, and data synchronization. In practice I'd start vertical because it's simple, then move horizontal once I hit the ceiling or need high availability. Most large systems do both."*

### Q: "Adding more servers — does that make my app faster?"
> *"It depends on what you mean by faster. Adding servers mainly increases throughput — total capacity — not the latency of an individual request; one request still takes the same time on any single machine. It's like adding baristas: the shop serves more coffees per hour, but your one coffee doesn't brew faster. That said, it indirectly helps latency under heavy load, because without enough servers, requests queue up and wait — and queuing is what makes an overloaded site feel slow."*

### Q: "Your system is getting slow under load — how do you diagnose and fix it?"
> *"First I'd measure — look at p99 latency and current throughput to find the bottleneck: is it the app tier, the database, or the network? If requests are queuing, I'm past my throughput ceiling, so I scale out the stateless app tier behind the load balancer. If the database is the bottleneck, I add caching so reads skip it, add read replicas to spread reads, and shard if writes are the problem. For slow individual requests, I'd add a CDN for static content and move slow work to an async queue. Throughout, I optimize the p99 tail, not the average."*

### Q: "What's the trade-off between latency and throughput?"
> *"The classic one is batching. Processing requests one at a time gives low latency but lower throughput because of per-request overhead. Batching many together gives high throughput because it's efficient, but each request waits for the batch, so latency goes up. Which I choose depends on the use case — a chat app prioritizes low latency, a data pipeline prioritizes high throughput."*

---

<a name="cheatsheet"></a>
# 5. Cheat Sheet — everything on one page

### Definitions
- **Latency** = time per single request (ms). Lower = faster feel.
- **Throughput** = requests handled per unit time (RPS/QPS/TPS). Higher = more capacity.

### Analogies
- **Highway:** latency = how fast one car crosses; throughput = how many cars pass per minute.
- **Coffee shop:** latency = your wait for one coffee; throughput = coffees served per hour. Adding baristas ↑ throughput, not your coffee's speed.

### Key relationships
- Related but **independent** — optimize separately.
- Low latency ≠ high throughput (one fast lane is still one lane).
- Under load, high latency lowers throughput (servers busy longer).
- Past the throughput **ceiling**, requests **queue** → latency **explodes**.

### Measuring
- Use **percentiles**, not averages. **p50** = typical; **p99** = worst 1% (tail).
- At scale, optimize the **tail (p99/p999)** — that 1% is millions of users.

### Latency ↔ throughput trade-off
- **One-at-a-time** = low latency, lower throughput.
- **Batching** = high throughput, higher latency.
- Chat app → latency; analytics pipeline → throughput.

### Scaling (performance view)
| | Vertical (scale up) | Horizontal (scale out) |
|---|---|---|
| Method | Bigger machine | More machines |
| Latency | ✅ improves | ⚠️ indirect (avoids queuing) |
| Throughput | ✅ (to ceiling) | ✅✅ main strength |
| Limit | Hardware ceiling | ~Unlimited |
| Failure | Single point of failure | Survives node loss |
| Complexity | Simple | LB + stateless + sync |

### Recommended practices
- **Latency:** cache, CDN, indexed/close DB, async queues, measure p99.
- **Throughput:** scale out, batch, read replicas + sharding, message queues for spikes.
- **Scaling:** start vertical → go horizontal; stateless from day one; auto-scale; load-test to find the ceiling.

### Golden rules
- Everything is a **trade-off** — name what you pay.
- Adding servers ↑ **throughput** first, latency only indirectly.
- Vertical helps both but is **capped + single point of failure**.
- Always report **p99**, not the average.
- Queuing is what makes an overloaded system *feel* slow before it *fails*.

### Suggested next topics
- **Caching** (strategies, eviction, cache invalidation — the biggest latency lever).
- **CAP theorem** (consistency vs. availability in full).
- **Message queues** (async processing, absorbing spikes).
- **Capacity estimation** (turn user counts into RPS/servers/storage).

*— End of Part 3 —*
