# Message & Delivery Guarantees — Scenario Bank

---

### "What happens when a request succeeds but the response is lost?"

The server did the work — say, charged a card — but the network dropped before the "200 OK" made it back to the client. The client only knows it didn't get a response; it has no idea whether the work happened or not. That ambiguity is the entire reason idempotency keys exist (see [`02-api-design/api-design.md`](../02-api-design/api-design.md)): the client's only *safe* move is to retry with the exact same idempotency key (so a duplicate is recognized and not reprocessed), or explicitly check status before assuming failure and sending a brand-new request.

**Interview line:** *"A timeout on the client side doesn't tell you whether the server-side work happened — the response could've just been lost. That's exactly why idempotency keys exist: the client retries with the same key instead of guessing, and the server treats it as a replay, not a new operation."*

**Tests:** ambiguity of network failure, idempotency

*Axis: failure · Source: challenge question*

---

### "How do you prevent duplicate processing? How do you guarantee at-least-once processing doesn't create duplicate effects?"

Most real message queues (SQS, Kafka, RabbitMQ with manual ack) guarantee **at-least-once** delivery, not exactly-once — meaning a message can be delivered to your consumer more than once. This happens naturally: the consumer processes a message, but crashes (or is just slow) before it sends the acknowledgment back to the queue; the queue, having never gotten the ack, assumes it wasn't processed and redelivers it.

So "prevent duplicate processing" really means: **make the handler safe to run twice with the same message.** Two common ways:
- Turn the write into something naturally idempotent — `UPSERT` (insert-or-update by a stable ID) instead of a blind `INSERT`.
- Track processed message IDs explicitly — before handling a message, check a "seen" table/set for its unique ID; if it's already there, skip it.

```js
async function handle(message) {
  const alreadyProcessed = await db.processedMessages.findOne({ id: message.id });
  if (alreadyProcessed) return; // safe to skip — already handled
  await db.orders.updateOne({ id: message.orderId }, { $set: {...} }, { upsert: true });
  await db.processedMessages.insertOne({ id: message.id });
}
```

**Interview line:** *"Most queues only guarantee at-least-once delivery, so my consumer has to assume it might see the same message twice — usually because it crashed after processing but before acking. I handle that by making the write idempotent, either an upsert by a stable ID, or by checking a processed-message-IDs table before doing the work."*

**Tests:** at-least-once delivery, idempotent consumers

*Axis: consistency · Source: challenge question*

---

### "How do you handle poison messages?"

A poison message is one that will *never* successfully process — bad data, a bug the handler can't recover from, whatever the cause. If your consumer just retries forever on failure, this one message can block everything behind it (if ordering matters) or just burn resources endlessly retrying something that will never succeed.

The fix: cap the retry count per message. After N failed attempts, stop retrying it and move it to a **Dead-Letter Queue (DLQ)** — a separate queue that holds messages needing manual inspection — instead of retrying it forever. That way the rest of the queue keeps flowing, and the bad message doesn't just vanish silently either; it's parked somewhere a human can look at it.

**Interview line:** *"I cap retries per message. Once a message fails that many times, it goes to a dead-letter queue instead of retrying forever — that keeps a single bad message from blocking the rest of the queue, while still preserving it for someone to investigate rather than silently dropping it."*

**Tests:** failure isolation, operational recovery

*Axis: failure · Source: challenge question*

---

### "What happens when a consumer crashes halfway through processing?"

Say processing one message does three things: charge a card, send a confirmation email, update the order status. The consumer crashes after step 1 but before step 3 — and because it never acked the message, the queue redelivers it. Now the handler runs again from the top. If step 1 (charging the card) isn't idempotent, this just charged the customer twice.

This is the same idempotent-consumer problem as duplicate processing, but it also raises a design point: for a multi-step handler, it helps to track **which steps already completed** (a simple status/step field on the record being processed) so a redelivery can pick up from where it left off — or at least skip the steps that are already done — instead of blindly re-running all of them.

**Interview line:** *"A crash mid-processing means the message gets redelivered and the handler runs again from scratch, so every step in it needs to be safe to repeat — or I track which steps already completed so a redelivery skips them instead of redoing the whole sequence."*

**Tests:** idempotent multi-step processing, crash recovery

*Axis: failure · Source: challenge question*

---

### "How do you safely replay failed events?"

Sometimes you deliberately want to reprocess old events — you fixed a bug in the consumer and need it to re-derive results from history, or you're rebuilding a cache/read-model from scratch. This only works safely if two things are true:

1. The events are actually **durably stored and replayable** — an event log like Kafka retains messages for a configured period (or forever), unlike a queue that deletes a message once it's acked.
2. The consumer is **idempotent**, so replaying an event that already had its effect applied doesn't apply it a second time — or you're replaying into a freshly emptied state you're intentionally rebuilding from zero (e.g. dropping and rebuilding a projection table).

**Interview line:** *"Safe replay needs two things: the events have to actually still exist somewhere replayable, like a Kafka log rather than a queue that deletes on ack, and the consumer has to be idempotent — or I'm replaying into a state I've deliberately reset, like rebuilding a projection from scratch."*

**Tests:** event sourcing basics, idempotency, durable logs

*Axis: recovery · Source: challenge question*

---

### "How do you handle out-of-order events?"

Network delays and parallel consumers mean events don't always arrive in the order they were produced — an "order updated" event can land before "order created." A handler that assumes strict order will do something nonsensical (update a record that doesn't exist yet).

Two common fixes:
- Attach a **version/sequence number or timestamp** to each event tied to the entity it affects, and have the consumer ignore/buffer any event older than the last one it already applied for that entity (last-write-wins by version, not by arrival order).
- **Partition by entity key** (e.g. Kafka partitioning by `orderId`) so all events for the *same* entity always land in the same partition and get processed in order by a single consumer — while events for *different* entities can still be processed in parallel across partitions.

**Interview line:** *"I don't rely on arrival order. Either I attach a version or timestamp per entity and ignore events older than what I've already applied, or I partition the stream by entity ID so all events for the same entity are guaranteed to be processed in order, while different entities still process in parallel."*

**Tests:** ordering guarantees, partitioning strategy

*Axis: consistency · Source: challenge question*

---
