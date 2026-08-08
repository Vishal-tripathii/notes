# Concurrency — Scenario Bank

> Optimistic vs pessimistic locking and deadlocks are covered in depth in [`01-distributed-systems-reliability/consistency-and-transactions.md`](../01-distributed-systems-reliability/consistency-and-transactions.md) and [`03-databases/transactions-and-isolation.md`](../03-databases/transactions-and-isolation.md) — cross-linked, not repeated.

---

### "What is a race condition? How does a race condition occur in a web API?"

A race condition happens when the **correctness of the result depends on the timing** of two or more operations happening concurrently — the code works fine when things happen one at a time, but produces a wrong result when they overlap in a specific unlucky way, and the bug is often invisible in testing because it only shows up under real concurrent load, not when you manually click through the flow once.

In a web API specifically, the classic shape is **read-then-write without atomicity**: check something (`if (seatsAvailable > 0)`), then act on it (`seatsAvailable -= 1`) — as two separate steps. If two requests both run the "check" step before either has run the "act" step, both see `seatsAvailable > 0` and both proceed, even though only one seat was actually available. This is exactly the "100 concurrent requests, last seat" scenario below.

```js
// racy — two concurrent requests can both pass the check before either decrements
const seat = await db.seats.findOne({ id });
if (seat.available > 0) {
  await db.seats.update({ id }, { available: seat.available - 1 }); // both requests get here
}
```

**Interview line:** *"A race condition is when the result depends on timing, not just logic — code that's correct one request at a time but wrong when two overlap in an unlucky order. In a web API the classic shape is check-then-act without atomicity: reading a value, then writing based on it, as two separate steps, which lets two concurrent requests both pass the check before either has applied its write."*

**Tests:** race condition fundamentals, check-then-act pattern

*Axis: concurrency · Source: challenge question*

---

### "How do you prevent double booking? How do you prevent two users from buying the last item?"

This is the flagship concurrency scenario — worth having the reasoning fully internalized, not just memorized:

```text
100 users
   ↓
last available seat
   ↓
100 concurrent requests
   ↓
How do you guarantee only ONE succeeds?
```

The wrong instinct is checking availability in application code (`if (seat.available > 0)`) and then issuing a separate update — as shown above, that's exactly the race. The fix is to make the **check and the decrement one atomic operation**, so the database itself — not application code — is what guarantees only one caller can succeed, by construction, not by hoping the timing works out.

**Atomic conditional update** — the most direct fix, and usually the best default:
```sql
UPDATE seats SET available = available - 1
WHERE id = 123 AND available > 0;
-- check the row-count of the result: 1 row updated = you got it, 0 rows updated = someone beat you to it
```
This works because the database evaluates the `WHERE` condition and applies the update as a single atomic step per row — two concurrent transactions attempting this can't both see `available > 0` and both succeed; the database's own row-level locking during the update serializes them, and only one can actually decrement past zero.

**Alternative approaches, for context:**
- **Pessimistic locking** — explicitly lock the row (`SELECT ... FOR UPDATE`) before checking, so a second concurrent transaction simply waits until the first one finishes and commits (or rolls back), rather than racing it at all.
- **Optimistic locking** (version-based) — read the row with its version, attempt the update conditioned on that version, and retry (re-read, re-check) if the version has since changed; works but needs an explicit retry loop for what's effectively a very-likely-to-conflict scenario under 100 simultaneous requests for one seat, which is why the direct atomic conditional update is usually cleaner for this specific "one scarce resource, many contenders" shape.
- **Distributed lock** (Redis-based) — reasonable if the "seat" concept spans something beyond one database's atomic capabilities, but adds real complexity (below) that a single atomic conditional update usually avoids needing at all.

**Interview line:** *"I wouldn't check-then-update in application code, since that's exactly the race. I'd make the check and the decrement one atomic database operation — an UPDATE with a WHERE available > 0 condition — and check the affected row count: one row updated means you got the seat, zero means someone else already did. The database's own atomicity is what guarantees only one of the hundred concurrent requests can succeed, not application-level timing."*

**Tests:** the flagship concurrency scenario, atomic conditional updates

*Axis: concurrency · Source: challenge question*

---

### "How do you safely increment a counter concurrently?"

Same root problem as the seat-booking scenario, generalized: "read current value, compute new value, write it back" as three separate steps is racy under concurrency — two concurrent increments can both read the same starting value and both write back `value + 1`, losing one of the increments (a lost update, category 01/03).

The fix, in order of preference:
- **A single atomic increment operation**, if the data store supports one — SQL's `UPDATE counters SET value = value + 1 WHERE id = ...` (the database computes `value + 1` internally from whatever the current value actually is, atomically, not from a value your application code read moments earlier), or Redis's `INCR` command (atomic by design, purpose-built for exactly this).
- **Optimistic locking**, if the increment logic is more complex than a simple `+1` (e.g. conditional on some other check) — version-checked write with retry on conflict.
- **A dedicated sequence/serial type**, if what's actually needed is a unique, ever-increasing ID rather than a shared visible count (most databases have a native construct for this — `SERIAL`/`IDENTITY` columns, MongoDB's counter-collection pattern — built to handle exactly this concurrently and correctly).

```js
// racy
const counter = await db.counters.findOne({ id });
await db.counters.update({ id }, { value: counter.value + 1 });

// safe — the database computes the new value from whatever's actually current
await db.counters.update({ id }, { $inc: { value: 1 } }); // atomic increment
```

**Interview line:** *"Read-compute-write as separate steps is racy for the same reason as the seat-booking case — two concurrent increments can read the same starting value and both write value+1, losing one. I'd use the data store's native atomic increment — SQL's value = value + 1 in a single UPDATE, or Redis's INCR — so the new value is always computed from whatever's actually current at write time, not from a value my application code read moments earlier."*

**Tests:** atomic operations, lost updates

*Axis: concurrency · Source: challenge question*

---

### "How do distributed locks work? When should you not use distributed locks?"

A distributed lock coordinates "only one process, across potentially many separate services/servers, does this at a time" — when an in-process lock (a mutex) isn't enough because the contenders aren't threads in one process, they're entirely separate processes/machines. The common implementation: use a shared, fast store (Redis is the classic choice) — acquiring the lock means writing a unique key with `SETNX` (set-if-not-exists, atomic) and a **TTL** (so the lock automatically expires even if the holder crashes without releasing it — critical, since a lock that can never expire turns one crashed process into a permanent deadlock for everyone else).

```js
const acquired = await redis.set(`lock:seat:123`, workerId, 'NX', 'EX', 10); // atomic, 10s TTL
if (acquired) {
  try { /* do the work */ }
  finally { await redis.del(`lock:seat:123`); } // release when done
}
```

**When not to use one:**
- **When an atomic database operation would do the same job more simply** — the seat-booking scenario above doesn't need a distributed lock at all; a single atomic conditional `UPDATE` already gets the same guarantee with far less machinery and no new failure mode to reason about.
- **When correctness genuinely can't tolerate the edge cases** — a naive TTL-based lock has a real correctness gap: if the lock holder is slow (a GC pause, a network stall) and the TTL expires *before* it finishes, another process can acquire the lock and start working on the same resource while the first is still (unknowingly) working on it too — genuine mutual exclusion under all failure modes needs more careful protocols (fencing tokens, or established algorithms like Redlock) that are easy to get subtly wrong if hand-rolled.
- **When it becomes a single point of failure/contention for something that doesn't need global coordination** — if it can be scoped narrower (a per-shard lock, or better, an atomic operation local to whichever database node owns the data), a global distributed lock is more coordination overhead than the problem requires.

**Interview line:** *"A distributed lock coordinates exclusive access across separate processes, typically via Redis with an atomic SETNX and a TTL so a crashed holder doesn't deadlock everyone else forever. I'd avoid one whenever an atomic database operation gets the same guarantee more simply, like the seat-booking case. And I'm cautious about naive TTL-based locks for anything where correctness really matters, because a slow holder whose TTL expires before it finishes can let a second process start working on the same resource concurrently — that needs a more careful protocol than a basic lock-with-a-timeout."*

**Tests:** distributed locking, TTL correctness gaps

*Axis: concurrency · Source: challenge question*

---

### "How do you make a job processor concurrency-safe?"

A job processor scaled to multiple workers (category 05/10) has the same fundamental risk as any other concurrent system: two workers picking up and processing the **same job** simultaneously, if job claiming isn't itself atomic.

- **Atomic job claiming** — the "pick up a job" step needs to be a single atomic operation, same principle as the seat-booking scenario: `UPDATE jobs SET status = 'processing', worker_id = ? WHERE id = ? AND status = 'pending'`, checking the affected row count — if a job is already claimed (status no longer `'pending'`), the update affects zero rows and this worker knows to move on to the next job instead. Most real message queues (SQS, RabbitMQ with proper ack semantics) handle this for you natively — a message becomes invisible to other consumers once one worker has received it — which is part of why using a real queue is usually better than hand-rolling job claiming on top of a plain database table.
- **Idempotent job handlers** — even with atomic claiming, at-least-once delivery (category 01/05) means a job can still be processed more than once (a worker crashes after finishing but before acknowledging) — so the handler itself should be safe to run twice, same discipline as an idempotent message consumer.
- **A visibility timeout** — if a worker claims a job and then crashes mid-processing without completing or failing it explicitly, the job needs to eventually become claimable again rather than being stuck "in progress" forever — most real queues implement this natively (a message becomes visible again if not acked within a timeout).

**Interview line:** *"The core risk is two workers claiming the same job. I make claiming itself atomic — the same conditional-update pattern as the seat-booking scenario — checking whether the update actually affected a row before assuming I own the job. On top of that, since at-least-once delivery means a job can still be processed twice even with atomic claiming, the handler itself needs to be idempotent, and I rely on the queue's visibility timeout so a job a crashed worker claimed doesn't stay stuck forever."*

**Tests:** job processing concurrency, atomic claiming, idempotent handlers

*Axis: concurrency · Source: challenge question*

---
