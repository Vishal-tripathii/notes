# Messaging & Event-Driven Fundamentals — Scenario Bank

> Several items in this category are direct duplicates of things already covered in depth in category 01 — cross-linked below rather than repeated:
> - Poison messages, consumer crash mid-processing, idempotent consumers, message ordering/out-of-order events, replaying failed events → [`01-distributed-systems-reliability/message-delivery-guarantees.md`](../01-distributed-systems-reliability/message-delivery-guarantees.md)
> - Retrying failed messages / dead-letter queues → same file, "poison messages" entry

---

### "Queue vs pub/sub? Kafka vs RabbitMQ?"

**Queue (point-to-point)** — a message is delivered to **one** consumer, and once processed, it's gone. Good for distributing work across a pool of workers — you want each job done exactly once, by whichever worker picks it up (a task queue for background jobs, e.g.).

**Pub/sub (publish-subscribe)** — a message (event) is broadcast, and **every** subscriber gets its own copy. Good for "something happened, multiple independent things need to react" — an order was placed, and the email service, the analytics service, and the inventory service all need to know, independently, without the publisher needing to know who's listening.

**RabbitMQ** — a traditional message **broker**. The broker actively manages queues, routing (via exchanges), and tracks delivery/acknowledgment per message. Strong at complex routing (route this message to these three queues based on its type) and at classic task-queue patterns. Messages are typically removed once consumed.

**Kafka** — a distributed **log**. Messages are appended to a durable, ordered log (partitioned across brokers) and *retained* for a configured period (or forever) regardless of whether anyone's consumed them yet. Consumers track their own read position (offset) in the log, so multiple independent consumer groups can each read the same data at their own pace, and — critically — you can **replay** history by resetting a consumer's offset backward. Built for high-throughput event streaming and for cases where you want the log itself as a durable source of truth, not just a delivery mechanism.

**Rule of thumb:** RabbitMQ for classic task queues and complex routing; Kafka for high-throughput event streams, multiple independent consumers of the same data, or when replay/durability of the event history itself matters.

**Interview line:** *"A queue delivers a message to one consumer for work distribution; pub/sub broadcasts it to every subscriber for independent reactions to the same event. RabbitMQ is a broker built for that classic queue/routing pattern. Kafka is a distributed, retained log — consumers track their own offset, multiple consumer groups can read the same data independently, and you can replay history by rewinding the offset. I'd reach for Kafka when I need high throughput, multiple independent consumers, or replayability; RabbitMQ for more classic task-queue and routing needs."*

**Tests:** messaging system trade-offs, queue vs log architecture

*Axis: normal · Source: challenge question*

---

### "When would you use asynchronous processing?"

Whenever the caller doesn't need the result **immediately**, and making them wait for it synchronously only adds latency (or risk) without adding value. Concretely:

- **Work that's genuinely slow** — video transcoding, generating a large report, sending a batch of emails — the user doesn't need to sit there while it happens; kick it off and let them know when it's done (or let it just happen in the background).
- **Decoupling reliability** — if Service A calls Service B synchronously and B is down, A's request fails too. If A instead publishes an event and B consumes it whenever it's healthy again, A's request succeeds independent of B's availability *right now*.
- **Smoothing traffic spikes** — a sudden burst of writes can overwhelm a database if applied synchronously and immediately; queuing them and processing at a sustainable rate absorbs the spike instead of falling over.
- **Fan-out to multiple independent consumers** — one event, several unrelated systems need to react, none of which should block the original request.

The trade-off going in: async means the caller no longer gets an immediate result/error — you need a way to communicate "it's still processing" or "it failed" back to whoever cares (polling, a webhook, a notification), which is real added complexity you're accepting in exchange for the benefits above.

**Interview line:** *"I reach for async when the caller doesn't need the result immediately, when I want to decouple two services' availability from each other, or when I need to absorb a traffic spike instead of applying it synchronously. The trade-off is real — you lose the immediate result/error and need a separate way to communicate completion or failure back — so I don't reach for it by default, only when the synchronous cost is actually a problem."*

**Tests:** async design judgment, trade-offs

*Axis: scale · Source: challenge question*

---

### "At-most-once vs at-least-once vs exactly-once? Why is exactly-once difficult?"

Three different guarantees about how many times a message gets delivered/processed:

- **At-most-once** — a message is delivered zero or one times, never more. Simple, but messages can be silently **lost** (if the consumer crashes before processing, it's just gone — no redelivery). Rarely what you actually want for anything that matters.
- **At-least-once** — a message is delivered one or **more** times — it's guaranteed to arrive, but might arrive more than once (redelivered after a crash before ack, as covered in category 01). This is what most real systems (SQS, Kafka with manual commit, RabbitMQ with manual ack) actually provide, because it's the achievable, practical guarantee. It pushes the "don't process twice" problem onto the consumer — hence idempotent consumers.
- **Exactly-once** — delivered and processed exactly one time, no duplicates, nothing lost. This is what people *want* intuitively, but it's genuinely hard to guarantee end-to-end, because it requires the message delivery **and** the side effect of processing it to be atomic together across two separate systems (the broker and wherever the consumer writes its result) — and there's no free distributed transaction spanning both. What some systems (Kafka with transactional producers/consumers) call "exactly-once" is really **at-least-once delivery + idempotent processing**, engineered carefully enough that duplicates are undetectable from the outside — not a fundamentally different mechanism.

**Interview line:** *"Exactly-once sounds like what you want, but it's genuinely hard because it needs delivery and the side effect of processing to be atomic across two separate systems, and there's no free distributed transaction for that. What real systems provide, including Kafka's 'exactly-once,' is at-least-once delivery combined with idempotent processing, engineered so duplicates are invisible from the outside — not a fundamentally different delivery mechanism."*

**Tests:** delivery guarantees, why exactly-once is hard

*Axis: consistency · Source: challenge question*

---

### "How do you scale consumers? What is consumer backpressure?"

Scaling consumers means adding more workers pulling from the same queue/topic so messages get processed in parallel instead of one at a time. For a partitioned system like Kafka, this has a specific mechanic worth knowing: **you can't have more active consumers in a group than partitions** — each partition is read by exactly one consumer in a group at a time, so scaling consumers beyond the partition count just leaves the extras idle. Scaling consumer throughput for a Kafka-backed system means planning the partition count for the parallelism you'll eventually need, not just adding workers freely.

**Backpressure** is what happens when consumers can't keep up with the rate messages are arriving — the queue/log backs up and keeps growing. The system needs an explicit response, not just letting the backlog grow unbounded:
- **Scale consumers up** (within the partition limit) to increase processing throughput.
- **Slow the producer down** — some systems can signal back to the producer to stop or slow sending (true backpressure, common in streaming contexts); many message queues can't do this, so the backlog is the only signal.
- **Shed load deliberately** — drop or deprioritize lower-value messages if the system is genuinely overwhelmed and can't be scaled fast enough, rather than let the whole thing degrade for everything.
- **Alert on queue depth** — a growing backlog is a leading indicator something needs attention before it becomes a full outage.

**Interview line:** *"Scaling consumers means adding more workers reading in parallel — for something partitioned like Kafka, that's capped at the partition count, so I plan partitions for the parallelism I'll eventually need. Backpressure is what happens when consumers can't keep up and the backlog grows — I handle that by scaling consumers up to the partition limit, and if that's still not enough, deliberately shedding lower-priority load rather than letting the whole system degrade."*

**Tests:** consumer scaling, backpressure handling

*Axis: scale · Source: challenge question*

---

### "How do you handle a consumer lagging behind? What if the producer is faster than consumers?"

**Consumer lag** is the gap between how much has been produced and how much has actually been consumed/processed — it's the direct symptom of the producer outpacing the consumers, and it's measurable (most systems expose it directly, e.g. Kafka consumer group lag).

The response depends on whether the imbalance is temporary or structural:
- **Temporary spike** (a burst of traffic) — the queue/log is a buffer absorbing it; as long as consumers can catch back up once the spike passes, and the backlog isn't so large it breaches a retention window (Kafka drops messages older than its retention period, even unconsumed ones) or memory limits (an unbounded in-memory queue), this is expected and fine.
- **Structural** (consumers are consistently, permanently slower than the produce rate) — this needs an actual fix: scale consumers (up to the partition limit), speed up per-message processing (find what's slow in the handler), or reduce what's being produced if some of it isn't actually necessary.
- **Monitor lag as a first-class metric** — rising lag over time (not just a temporary spike that recovers) is an early warning of a problem that will eventually become data loss (retention expiry) or an ever-growing backlog, and it's much cheaper to catch it via a metric than to discover it when messages start getting dropped.

**Interview line:** *"Consumer lag is the measurable gap between produced and consumed — I'd watch it as a real metric, not just discover the problem when something breaks. A temporary spike that recovers is fine, that's what the queue is for. Lag that keeps growing over time is structural — I'd scale consumers, find what's slow in the processing itself, or reconsider whether everything being produced actually needs to be, since unconsumed lag eventually turns into real data loss once it outlives the retention window."*

**Tests:** consumer lag, capacity planning

*Axis: scale · Source: challenge question*

---

### "Event sourcing — when would you use it?"

Most systems store **current state** — a `users` table has each user's current values, and past values are just gone once overwritten. Event sourcing instead stores the **sequence of events** that led to the current state (`UserCreated`, `EmailChanged`, `UserDeactivated`) as the source of truth, and current state is *derived* by replaying those events — it's not stored directly at all (or it's cached as a "projection" that can always be rebuilt from the events).

What this buys you:
- **A complete audit trail for free** — you didn't just capture "the email is now X," you captured every change that ever happened and when, which is exactly what audit/compliance requirements often want.
- **The ability to rebuild any past state**, or replay history into a brand-new projection (see "safely replay failed events" in category 01) — useful when you need a new read-model shaped differently than anything you originally built.
- **Debugging power** — "why is this record in this state?" has a literal, complete answer: replay the events and watch it happen.

What it costs: real complexity (rebuilding current state from a full event history isn't free at read time, so you typically need projections/snapshots anyway), and it's a significant architectural commitment that's hard to bolt on halfway through a project.

**When to use it:** domains where the *history* of changes is itself valuable — not just the current value — like financial ledgers, audit-heavy systems, or anywhere "how did we get here" is a real, recurring question. **Not** a default choice for typical CRUD apps where only current state matters and the complexity wouldn't buy anything.

**Interview line:** *"Event sourcing stores the sequence of events that happened, not just current state — current state is derived by replaying them. That gets you a complete audit trail and the ability to rebuild any past state or a brand-new projection for free, at the cost of real architectural complexity. I'd reach for it specifically where the history of changes matters as much as the current value — financial ledgers, audit-heavy domains — not as a default for a typical CRUD app."*

**Tests:** event sourcing trade-offs, when the complexity is worth it

*Axis: normal · Source: challenge question*

---
