# Consistency & Distributed Transactions — Scenario Bank

---

### "Strong consistency vs eventual consistency — when do you choose which?"

**Strong consistency** means: the instant a write succeeds, every subsequent read — from anywhere — sees that new value. Nothing is stale, ever. This is what a single relational database gives you by default on the same row.

**Eventual consistency** means: after a write, there's a window where different parts of the system might still disagree — a replica hasn't caught up yet, a cache hasn't been invalidated yet — but if you stop writing, everything *will* converge to the same value eventually.

Strong consistency is easier to reason about but costs coordination — it's slower and harder to scale across regions, because every read has to be sure it's talking to the source of truth (or something perfectly in sync with it). Eventual consistency scales much better (any replica can serve a read, no coordination needed) but the application has to tolerate briefly-stale reads.

**Choose strong when:** correctness matters instantly — a bank balance, an inventory count deciding whether to sell the last item, anything where a stale read causes a real bug (double-selling, double-spending).
**Choose eventual when:** brief staleness is harmless — a "like count," a social feed, search index freshness, most read replicas serving traffic that isn't safety-critical.

**Interview line:** *"Strong consistency means every read after a write immediately sees the new value; eventual consistency means it will converge eventually, but there's a window of possible staleness. I use strong consistency where a stale read causes a real bug — money, inventory — and eventual consistency everywhere else, because it scales far better."*

**Tests:** CAP-theorem-adjacent reasoning, trade-off judgment

*Axis: consistency · Source: challenge question*

---

### "What happens when two services update the same entity simultaneously?"

Whichever write lands last **silently overwrites** the other one, unless something explicitly prevents that — this is the classic "lost update" problem. Service A reads a user record, changes the email, and writes it back. Service B does the same thing concurrently, based on the *original* data, and writes its version back a moment later — now A's change is gone, and nobody got an error telling them so.

The fix requires detecting the conflict, not just avoiding it by luck:
- **Optimistic locking** — each record has a version number; a write includes "the version I read," and the database rejects the write if the version has since changed underneath it. The loser gets an explicit conflict to handle (retry, merge, or ask the user), instead of silently losing data.
- **Pessimistic locking** — take a lock before reading, so nobody else can even start a conflicting update until you're done. Simpler to reason about, but you're serializing work that might have been fine to run concurrently.

**Interview line:** *"Without protection, the second write just silently overwrites the first — a lost update. I'd use optimistic locking: version the record, and reject a write if the version changed since it was read, so the conflict is explicit instead of silent."*

**Tests:** lost updates, optimistic vs pessimistic locking

*Axis: concurrency · Source: challenge question*

---

### "How do you handle race conditions across services?"

A race condition inside one process is usually solved with a lock or an atomic operation. Across *services*, you don't have a shared lock to reach for — each service has its own process, often its own database. The tools shift to things that work over the network:

- A **distributed lock** (e.g. Redis-based, with a TTL so it can't be held forever if a service crashes) — coordinates "only one service does this at a time," but adds real complexity and a new failure mode (what if the lock holder dies without releasing it?).
- Push the coordination into a **single owner** — route all writes for a given entity through one service/queue partition, so there's naturally no cross-service race on that entity in the first place.
- **Idempotent + retryable operations with conflict detection** (versioning, as above) — instead of preventing the race, let it happen and detect/resolve the conflict afterward.

Which one is right depends on how often the race actually happens and how bad a conflict is — a distributed lock for something that's rarely contested is often more complexity than it's worth.

**Interview line:** *"Across services I can't reach for an in-process lock, so I either use a distributed lock with a TTL, route writes for the same entity through a single owner so there's no cross-service race to begin with, or accept the race and detect the conflict afterward with versioning — the right choice depends on how often it actually happens and how expensive a conflict is."*

**Tests:** distributed coordination, trade-off judgment

*Axis: concurrency · Source: challenge question*

---

### "How do you maintain consistency across multiple databases?"

This is the hard case: you can't wrap a single ACID transaction around writes to two *different* databases (e.g. Postgres + MongoDB, or two separate service-owned databases) — there's no shared transaction log between them. If you write to DB A and then the process crashes before writing to DB B, the two are now permanently out of sync with nothing to automatically fix it.

The realistic options:
- **Accept eventual consistency** and use an event-driven approach — write to DB A, publish an event, have the consumer update DB B. There's a window where they disagree, but the system converges. This is by far the most common real-world approach.
- **Transactional outbox pattern** (below) — makes the "write to DB A + publish the event" step atomic, so you never lose the event.
- **Saga pattern** (below) — for a multi-step business process spanning services, with explicit compensating actions if a later step fails.
- **Two-phase commit (2PC)** — the "textbook" strongly-consistent answer, but rarely used in practice: it needs a coordinator, blocks all participants while it runs, and a coordinator crash can leave everything stuck mid-transaction. Mentioned mostly so you know why people avoid it.

**Interview line:** *"You can't get a single ACID transaction across two different databases, so I lean on eventual consistency through events — write to the first database, publish an event, let the second database catch up — usually backed by an outbox pattern so the event can't get lost. For a multi-step business process, I'd reach for a Saga with compensating actions instead of trying to force strong consistency with two-phase commit."*

**Tests:** distributed transaction trade-offs, event-driven consistency

*Axis: consistency · Source: challenge question*

---

### "How do you implement distributed transactions? When would you use Saga?"

A **Saga** breaks one business transaction that spans multiple services into a sequence of local transactions, each with a **compensating action** that undoes it if a later step fails. Example — booking a trip: reserve flight → reserve hotel → charge card. If charging the card fails, you don't have a single rollback to reach for across three services; instead you explicitly run compensations in reverse — cancel the hotel reservation, cancel the flight reservation.

Two styles:
- **Choreography** — each service publishes an event when its step is done, and the next service reacts to it. No central coordinator; simpler for a few steps, but the overall flow becomes hard to see just by reading code — you have to trace events across services.
- **Orchestration** — a central coordinator explicitly calls each step in order and decides what to do on failure. Easier to reason about and debug for anything with more than a couple of steps, at the cost of a central component to build and maintain.

You reach for Saga specifically when a business process spans multiple services/databases and you need "all steps succeed, or the ones that already ran get cleanly undone" — without a real distributed transaction to fall back on.

**Interview line:** *"A Saga splits a multi-service transaction into local steps, each with a compensating action to undo it if a later step fails — like cancelling a hotel reservation if the payment step fails. I'd use choreography for a couple of simple steps, and orchestration once the flow has enough steps that I want one place that clearly shows the whole sequence and its failure handling."*

**Tests:** distributed transaction design, choreography vs orchestration

*Axis: consistency · Source: challenge question*

---

### "What is the transactional outbox pattern?"

The problem it solves: you want to update your database **and** publish an event about that update, and you need both to happen — or neither. If you write to the database first and then publish the event as a separate step, a crash between the two leaves your database updated but nobody ever told (or vice versa: you publish first, then the DB write fails, and now consumers react to something that never actually happened).

The outbox pattern fixes this by writing the event into an **outbox table in the same database, in the same transaction** as the actual business write — so they succeed or fail together, atomically, because it's just one transaction on one database. A separate background process then reads unpublished rows from the outbox table and publishes them to the actual message broker (Kafka, RabbitMQ), marking them published once confirmed.

```sql
BEGIN;
  UPDATE orders SET status = 'shipped' WHERE id = 123;
  INSERT INTO outbox (event_type, payload) VALUES ('order.shipped', '{"orderId":123}');
COMMIT;
-- a separate poller reads unpublished outbox rows and publishes them to Kafka/RabbitMQ
```

**Interview line:** *"The outbox pattern writes the event to an outbox table in the same database transaction as the actual business write, so they're atomic together — then a separate process publishes from that outbox to the real message broker. It solves the 'update the DB and publish an event, but never just one of the two' problem without needing a distributed transaction."*

**Tests:** atomicity across a write and a publish, dual-write problem

*Axis: consistency · Source: challenge question*

---

### "How do you prevent lost updates?"

A lost update happens when two writers both read the same data, both compute a change based on what they read, and the second write overwrites the first without either writer knowing about the other's change — this is the same failure mode as "two services update the same entity simultaneously," above, generalized to any two concurrent writers (could be two requests, two users, two services).

Concretely: user balance is $100. Request A reads $100, adds $10 → writes $110. Request B, running concurrently, also read $100, subtracts $5 → writes $95. Whichever write lands last wins, and the other's change is just gone — the true answer, $105, was never written.

Prevention:
- **Optimistic locking** (version/timestamp check on write) — detects the conflict and rejects the second write, forcing a retry against fresh data.
- **Atomic operations at the database level** — `UPDATE balance = balance + 10` (a relative operation the DB applies atomically) instead of "read balance, compute new value in application code, write it back" — this sidesteps the problem entirely for simple arithmetic updates.
- **Pessimistic locking** — lock the row for the duration of the read-modify-write, so the second writer simply waits instead of racing.

**Interview line:** *"Lost updates happen when 'read, modify in application code, write back' runs concurrently from two places — whoever writes last wins and the other change vanishes. Where possible I push the modification into an atomic database operation like `balance = balance + 10` instead of doing the math in application code; where that's not possible, I use optimistic locking to reject a write against stale data."*

**Tests:** read-modify-write races, atomic operations vs application-level logic

*Axis: concurrency · Source: challenge question*

---

### "Optimistic vs pessimistic locking?"

Both solve the same problem — two things trying to modify the same data at once — with opposite philosophies:

**Pessimistic locking** assumes conflicts are common: take a lock *before* you touch the data, so nobody else can even start until you're done. Simple to reason about, but it serializes work — everyone else waits, even if their change wouldn't actually have conflicted, and a slow or crashed lock-holder blocks everyone behind it.

**Optimistic locking** assumes conflicts are rare: don't lock anything up front, just do the read-modify-write, and check on write whether the data changed underneath you (via a version number or timestamp). If it did, reject the write and let the caller retry. No one is blocked while nothing is actually happening, but under heavy contention on the *same* record, you get a lot of rejected writes and retries.

```sql
-- optimistic: fails if `version` no longer matches what was read
UPDATE accounts SET balance = 90, version = version + 1
WHERE id = 1 AND version = 5;
```

**Choose pessimistic** when conflicts are frequent and retrying is expensive (e.g. seat booking at the exact moment of a sale). **Choose optimistic** when conflicts are rare and you'd rather pay an occasional retry than block everyone by default (the more common case in typical CRUD apps).

**Interview line:** *"Pessimistic locking blocks other writers up front, which is safe but serializes access even when conflicts would've been rare. Optimistic locking lets everyone proceed and only rejects a write if the data changed underneath it, using a version check — I default to optimistic unless conflicts are frequent enough that constant retries would be worse than just blocking."*

**Tests:** concurrency control trade-offs

*Axis: concurrency · Source: challenge question*

---

### "How do you handle stale reads?"

A stale read is when you read data that was true a moment ago but has since changed — most commonly because you read from a replica that hasn't caught up with the primary yet, or from a cache that hasn't been invalidated yet. Whether this is a problem depends entirely on what the read is for.

- If staleness is **harmless** (a dashboard, a "last updated 3 seconds ago" feed) — do nothing, eventual consistency is fine.
- If staleness would cause a **real bug** — e.g. you just wrote data and then immediately need to read your own write for a subsequent step — either **read from the primary** for that specific read (bypass the replica), or use a data store that supports **read-your-writes consistency**, or pass a version/timestamp token forward and have the replica wait until it's caught up to at least that point before answering.
- For a cache specifically: shorten the TTL, or explicitly invalidate the cache entry as part of the write that changed the underlying data, instead of waiting for it to expire naturally.

**Interview line:** *"Whether a stale read matters depends on what it's for. If it's harmless I just accept it — that's the whole point of eventual consistency. If a specific read genuinely needs the latest write, like reading right after writing, I route that read to the primary instead of a replica, rather than trying to make every read strongly consistent by default."*

**Tests:** consistency trade-offs, read-your-writes

*Axis: consistency · Source: challenge question*

---

### "How do you deal with clock differences between services?"

Different machines' clocks drift from each other — even with NTP sync, you can have milliseconds to seconds of skew. This becomes a real bug if your logic assumes timestamps from different services are directly comparable — e.g. "whichever write has the later timestamp wins" (last-write-wins) can pick the *wrong* winner if the "earlier" write actually happened later in real time but on a machine with a clock running behind.

Ways to deal with it:
- **Don't rely on wall-clock time for ordering across machines at all.** Use a **logical clock** instead — a monotonically increasing counter (a Lamport clock, or a per-entity version number) that captures "happened-before" relationships correctly regardless of physical clock drift.
- If you must use timestamps, generate them at a **single, authoritative source** (e.g. the database assigns the timestamp on write, not the client), so at least all writes to that data are ordered by one clock, not many disagreeing ones.
- For genuinely distributed systems at scale, some databases (e.g. Google Spanner) solve this with specialized infrastructure (atomic clocks / GPS-synced time with bounded uncertainty) — worth knowing this exists, not something you're expected to build yourself.

**Interview line:** *"I don't trust wall-clock timestamps from different machines to be directly comparable for ordering — clock drift can make last-write-wins pick the wrong winner. I'd use a logical clock, like a version number or Lamport clock, or have a single authoritative source assign the timestamp, rather than trusting each service's own clock."*

**Tests:** distributed time, ordering guarantees

*Axis: consistency · Source: challenge question*

---
