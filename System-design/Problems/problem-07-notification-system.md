# Design Problem 07 — Notification System (system scale)

> Worked end-to-end using the **[Master Framework](../00-DESIGN-PROBLEM-FRAMEWORK.md)**. Applies Parts 13, 14. Signature challenge: multi-channel fan-out (push/email/SMS) to potentially millions of recipients, with dedup and retry, without becoming a bottleneck for the services that trigger notifications.
>
> **Note:** [`../../LLD/Problems/problem-11-notification-system.md`](../../LLD/Problems/problem-11-notification-system.md) covers the **CLASS design** (Observer/Decorator) for one dispatch service — this file is the **SYSTEM** that runs at scale across many workers/queues.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Capacity Estimation](#estimation)
3. [API Design](#api)
4. [Core: the async fan-out pipeline](#core)
5. [Dedup](#dedup)
6. [Database](#db)
7. [Scaling](#scaling)
8. [Full architecture](#arch)
9. [Interview Q&A](#interview)
10. [Cheat Sheet](#cheatsheet)

---

<a name="requirements"></a>
# 1. Requirements *(Part 1)*

**Functional:**
1. Any internal service can **trigger** a notification event (order shipped, price drop, flash sale, comment reply).
2. Deliver via the user's **preferred channel(s)**: push (mobile), email, SMS — user picks per-category.
3. **Avoid duplicate sends** for the same event, even under retries.
4. **Retry** on transient failure (provider timeout, rate-limited), with backoff.
5. *(Optional)* in-app notification feed, read/unread state.

**Non-functional:**
- **High throughput, bursty** — a flash sale or outage alert can spike to millions of notifications in seconds.
- **Triggering services must never block** on notification delivery — it's not on their critical path.
- **At-least-once delivery** is acceptable; **at-most-once per logical event** is required (no double-charge-card-style duplicate spam).
- **Eventual delivery**, not real-time guarantee — a few seconds to minutes of lag is fine for push/email/SMS.
- Third-party providers (APNs, FCM, SendGrid, Twilio) have their **own rate limits** — we must respect them.

> Write-heavy, bursty, fan-out shape (one event → many recipients or many channels) → **the queue is the whole design.**

---

<a name="estimation"></a>
# 2. Capacity Estimation *(Part 3)*

Assume 50M users, average day sends ~20M notifications, but design for **peak burst** (flash sale to 5M users at once).

- **Steady state:** 20M/day ÷ 86,400s ≈ **~230 events/s**
- **Peak burst:** 5M pushes triggered in a ~2 min sale window ≈ **~40,000 notifications/s** for that window
- **Fan-out multiplier:** one "event" (e.g. "sale started") can expand to millions of per-user deliveries — the **event** is 1 write, but the **deliveries** are N. Design the queue for delivery-level throughput, not event-level.
- **Storage (delivery log):** 20M/day × 365 × 2yr × ~300B ≈ **~4.4 TB** (prune/cold-archive old logs).
- **Provider ceiling:** e.g. FCM ~allows very high throughput but SendGrid/Twilio often cap at low thousands/sec per account → **this, not our infra, is usually the real bottleneck.**

> Key number to say out loud: *"Peak fan-out can be 100x steady state — the queue must absorb bursts the provider can't."*

---

<a name="api"></a>
# 3. API Design *(Part 11)*

Internal-only API — other services call **us**, never the third-party providers directly.

```
POST /internal/notifications
Body: {
  "eventId": "order-8891-shipped",      // idempotency key
  "userId": "u123",
  "type": "ORDER_SHIPPED",
  "channels": ["push", "email"],        // optional — omit to use user prefs
  "payload": { "orderId": "8891", "eta": "Tue" }
}
→ 202 Accepted { "status": "queued" }
```

- **202, not 200** — this is fire-and-forget from the caller's point of view. The caller gets an immediate ack that the event was accepted onto the queue, not that it was delivered.
- `eventId` is **caller-supplied and required** — it's the idempotency key (see Dedup).
- Caller never talks to APNs/FCM/SendGrid/Twilio — only to us. **Decoupling via a queue, not a direct call**, is the whole point: a slow or down third-party provider must never make the *order service* (or whichever caller) hang.

---

<a name="core"></a>
# 4. Core: the async fan-out pipeline 🎯

The signature challenge: get from **one triggering event** to **millions of channel-specific deliveries**, without the triggering service ever waiting on a slow third-party API.

```
[Triggering service] --POST /internal/notifications--> [Notification API] --enqueue--> [Queue]
                                                                                            │
                                                                          [Worker pool reads from queue]
                                                                                            │
                                                                    look up user's channel preferences
                                                                                            │
                                                              ┌─────────────┼─────────────┐
                                                              ▼             ▼             ▼
                                                          [APNs/FCM]   [SendGrid]     [Twilio]
                                                            (push)      (email)        (SMS)
```

**Why the queue is the core design decision:**
1. **Decoupling** — the triggering service's job ends the instant the event is on the queue (milliseconds). It has zero dependency on APNs being up or SendGrid being slow.
2. **Absorbs bursts** — a flash sale enqueues 5M events instantly; the queue holds them and workers drain at a sustainable rate instead of the write spike hitting providers (and our own DB) all at once.
3. **Fan-out happens on the consumer side** — a single "sale started, notify segment X" event can be expanded into millions of per-user messages by a **fan-out worker**, which itself pushes onto per-channel queues. This keeps the producer-side API cheap (one write) no matter how large the audience.
4. **Worker pool decouples our throughput from the provider's throughput** — if Twilio starts rate-limiting us, only the SMS worker pool slows down; push and email keep flowing.

**Pipeline steps in detail:**
1. Event lands on **ingest queue**.
2. **Fan-out worker** expands segment/broadcast events into individual `(userId, event)` pairs, and looks up each user's channel prefs (push/email/SMS/none) from a fast cache.
3. Each `(userId, channel, event)` triple is pushed onto a **per-channel queue** (`push-queue`, `email-queue`, `sms-queue`) — separating queues per channel lets each have its own worker pool sized to its provider's rate limit.
4. **Channel worker** pops a message, calls the provider SDK/API, writes a delivery-log row (sent/failed), and on transient failure requeues with **exponential backoff** (or lets a dead-letter queue catch it after N attempts).

---

<a name="dedup"></a>
# 5. Dedup *(idempotency)*

**The problem:** retries are expected (worker crashes mid-send, queue redelivers, network blip) — but a retry must never cause the user to get the **same** notification twice.

**Fix: idempotency key per notification event.**
- The caller-supplied `eventId` (e.g. `"order-8891-shipped"`) is combined with `(userId, channel)` to form a dedup key: `order-8891-shipped:u123:push`.
- Before actually calling the provider, the worker does an **atomic check-and-set** against a fast store (Redis `SETNX` with a TTL, e.g. 24h): if the key already exists → **skip send**, it was already handled; if not → set it and proceed.
- This makes the send **effectively exactly-once** even though delivery off the queue is only **at-least-once**.
- Same trick as payment idempotency keys (Part 11) — the pattern generalizes: *at-least-once transport + idempotency key = effectively-once effect.*

---

<a name="db"></a>
# 6. Database *(Part 8)*

Two distinct tables with very different access patterns:

**User notification preferences** (small, read-heavy, hot on every send):
```
userId(PK) | channel | category | enabled | pushToken | email | phone
```
- Read on almost every fan-out step → **cache aggressively** (Redis), invalidate on preference update. NoSQL or SQL both fine at this size — it's small per-user config, not big data.

**Delivery log** (huge, write-heavy, append-only):
```
deliveryId(PK) | eventId | userId | channel | status(sent/failed/retried) | attempts | providerResponse | createdAt
```
- **NoSQL fits naturally** (DynamoDB/Cassandra) — high write volume, simple key access (by `eventId` or `userId`), no joins, shard by `userId` or `deliveryId`.
- This table is also what the idempotency check could be answered from in principle, but a dedicated Redis key is far faster than a DB read on the hot path — DB log is for audit/debugging/analytics, not the dedup gate itself.

---

<a name="scaling"></a>
# 7. Scaling

- **Queue partitioning by notification type/priority** — a critical alert (e.g. "your payment failed") shouldn't sit behind a queue backed up with millions of low-priority marketing pushes. Separate queues (or priority lanes within one queue) per category, with dedicated worker pools, so a marketing blast can't starve transactional notifications.
- **Partition further by channel** (push/email/SMS queues) — each provider has a different rate limit and failure mode; isolating queues means SendGrid being slow doesn't back up push notifications.
- **Worker autoscaling** — worker pool size scales with queue depth (a standard "queue length → autoscale consumers" pattern), so the flash-sale burst spins up more workers automatically and scales back down after.
- **Rate limiting against third-party provider limits** — each channel's worker pool self-throttles (token bucket, Part 5.5) to stay under the provider's documented cap (e.g. Twilio's per-account SMS/sec limit) rather than getting 429'd and wasting retries. This is rate limiting **outbound**, the mirror image of the usual inbound API rate limiter.
- **Retry + dead-letter queue** — transient failures (provider 5xx, timeout) retry with exponential backoff; after N attempts, move to a DLQ for manual/alerted inspection instead of retrying forever and hogging worker capacity.
- **Batching where providers support it** — FCM/APNs support batch sends; batching reduces per-call overhead and helps stay under rate limits during bursts.

---

<a name="arch"></a>
# 8. Full architecture

```
[Any internal service]
      │  POST /internal/notifications  (eventId = idempotency key)
      ▼
[Notification API]  ← thin, just validates + enqueues, returns 202 fast
      │
[Ingest Queue]
      │
[Fan-out Worker]  ← expands segment/broadcast → per-user, looks up prefs (cached)
      │
   ┌──┼──────────────┐
   ▼  ▼              ▼
[Push Q] [Email Q] [SMS Q]        ← partitioned by channel (+ priority lanes)
   │        │          │
[Push Workers] [Email Workers] [SMS Workers]   ← autoscale on queue depth, rate-limited per provider
   │        │          │
[APNs/FCM] [SendGrid] [Twilio]
   │        │          │
   └────────┴──────────┘
            │
   Idempotency check (Redis SETNX) before every send
            │
   [Delivery Log DB — sharded/replicated]        ← audit trail, retry state
            │
   Failures after N retries → [Dead-letter Queue] → alerting
```

---

<a name="interview"></a>
# 9. Interview Q&A

### Q: "Why put a queue between the triggering service and the actual send?"
> *"So the triggering service's request path never depends on a third-party provider's latency or uptime. It writes one event to a queue and gets an immediate ack — that's milliseconds. The actual APNs/FCM/SendGrid/Twilio call happens asynchronously in a worker pool, decoupled from the caller entirely. If Twilio is slow or down, only the SMS workers back up — the order service, or whatever triggered the notification, is completely unaffected."*

### Q: "How do you prevent sending the same notification twice?"
> *"Every event carries a caller-supplied idempotency key. Before a worker actually calls the provider, it does an atomic check-and-set — Redis SETNX with a TTL — on a key combining the event ID, user, and channel. If that key's already set, we skip the send; it means this event was already handled, likely a queue redelivery from an at-least-once system. That turns at-least-once delivery into effectively-once sends."*

### Q: "How does a single event become millions of deliveries without overloading anything?"
> *"A fan-out worker expands one broadcast event into per-user messages and pushes them onto per-channel queues, so the producer-side API stays a single cheap write regardless of audience size. The actual sending is spread across autoscaling worker pools that drain the queue at a sustainable rate — the queue absorbs the burst instead of it hitting the providers or our DB all at once."*

### Q: "How do you avoid hitting third-party rate limits?"
> *"Each channel gets its own worker pool and its own queue, sized and throttled — usually a token bucket — to stay under that specific provider's documented rate limit. That isolation also means one provider's limits or slowness can't back up a different channel; SMS being throttled doesn't touch push or email."*

### Q: "What happens when a send keeps failing?"
> *"Transient failures — timeouts, 5xx, provider rate-limit responses — get retried with exponential backoff. After a capped number of attempts, the message moves to a dead-letter queue instead of retrying forever, and that triggers an alert for investigation. This keeps a single bad message from hogging worker capacity indefinitely."*

---

<a name="cheatsheet"></a>
# 10. Cheat Sheet

- **Shape:** write-heavy, bursty fan-out — one event can expand to millions of deliveries; triggering services must never block.
- **Estimate:** ~230 events/s steady, bursts to ~40,000 deliveries/s; provider rate limits are usually the real ceiling, not our infra.
- **API:** internal-only `POST /internal/notifications`, `eventId` = idempotency key, returns 202 (fire-and-forget).
- **Core:** event → queue → fan-out worker (expand + lookup prefs) → per-channel queue → channel workers → provider (APNs/FCM/SendGrid/Twilio). Queue = decoupling from slow/down third parties.
- **Dedup:** idempotency key (`eventId:userId:channel`) via Redis SETNX + TTL before every send — at-least-once transport, effectively-once send.
- **DB:** small cached prefs table (userId→channel/prefs) + large append-only delivery log (NoSQL, sharded).
- **Scale:** partition queues by type/priority and by channel; autoscale workers on queue depth; rate-limit outbound per provider; retry + DLQ for failures.
- **Bottleneck to name:** third-party provider throughput caps, not our own compute.

*— Design Problem 07 complete —*
