# Database Transactions & Isolation — Scenario Bank

> Optimistic vs pessimistic locking is covered in depth in [`01-distributed-systems-reliability/consistency-and-transactions.md`](../01-distributed-systems-reliability/consistency-and-transactions.md) — same concept, cross-linked rather than repeated here.

---

### "What are ACID properties?"

Four guarantees a database transaction gives you, and each one exists to prevent a specific, concrete failure:

- **Atomicity** — a transaction is all-or-nothing. If step 3 of 5 fails, steps 1-2 get rolled back too — you never end up with a half-applied transaction. (Without it: a money transfer that debits one account but crashes before crediting the other.)
- **Consistency** — a transaction can only take the database from one valid state to another valid state, respecting constraints (foreign keys, unique constraints, check constraints). (Without it: a foreign key pointing at a row that doesn't exist.)
- **Isolation** — concurrent transactions don't see each other's incomplete, in-progress changes. (Without it: you read another transaction's uncommitted, possibly-about-to-be-rolled-back data — a dirty read, below.)
- **Durability** — once a transaction commits, it survives a crash immediately after — it's actually written to durable storage, not just sitting in memory. (Without it: the server crashes a second after confirming your payment, and the payment is just gone.)

```sql
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT; -- both happen, or (on any failure) neither does
```

**Interview line:** *"ACID is four guarantees, each preventing a specific bug: atomicity means all-or-nothing, so a crash mid-transaction can't leave a half-applied change. Consistency means constraints always hold. Isolation means concurrent transactions can't see each other's uncommitted changes. Durability means once committed, a crash a second later can't lose it."*

**Tests:** ACID fundamentals, why each property exists

*Axis: consistency · Source: challenge question*

---

### "What isolation levels exist? What is a dirty read? What is a phantom read?"

Isolation is a **dial**, not a single guarantee — stricter isolation prevents more anomalies but costs more performance (more locking, more blocking). From weakest to strongest:

- **Read Uncommitted** — can see other transactions' uncommitted changes. Allows **dirty reads**: you read data another transaction wrote but hasn't committed yet — and if that transaction rolls back, you just acted on data that never actually existed.
- **Read Committed** — only sees committed data, but a value can still change between two reads *within the same transaction* if another transaction commits in between (a **non-repeatable read**). This is Postgres's default.
- **Repeatable Read** — the same row read twice within a transaction is guaranteed to return the same value. Still allows **phantom reads**: a *new* row matching your `WHERE` clause can appear on a second query within the same transaction (someone else inserted a row that matches your filter, mid-transaction).
- **Serializable** — the strictest: transactions behave as if they ran one at a time, in some order, even though they actually ran concurrently. No dirty reads, no non-repeatable reads, no phantoms — at the highest locking/performance cost.

```
dirty read       → you read data that was never actually committed
non-repeatable   → the same row gives a different value on a second read, same transaction
phantom read     → the same query returns a different SET of rows on a second read, same transaction
```

**Interview line:** *"Isolation levels are a trade-off dial between correctness and performance. Read Committed is the common default and stops dirty reads but not non-repeatable reads or phantoms. Serializable stops all of it by making transactions behave as if they ran one at a time, at the cost of more locking. I pick the level based on what anomaly would actually be dangerous for this specific operation, not just default to the strictest everywhere."*

**Tests:** isolation levels, concurrency anomalies

*Axis: consistency · Source: challenge question*

---

### "What causes deadlocks? How do you prevent deadlocks?"

A deadlock: Transaction A holds a lock on Row 1 and is waiting to lock Row 2. Transaction B holds a lock on Row 2 and is waiting to lock Row 1. Neither can proceed — each is waiting on the other, forever, unless something intervenes. The database's deadlock detector eventually notices the cycle and kills one of the transactions (rolling it back with a deadlock error) so the other can proceed.

Prevention, in practice:
- **Always acquire locks in a consistent order** across your whole codebase — e.g. always lock the lower `id` first, then the higher one, everywhere, so two transactions can never form a cycle waiting on each other in opposite orders.
- **Keep transactions short** — the shorter a transaction holds its locks, the smaller the window for a deadlock to even form.
- **Avoid unnecessary locking** — reach for optimistic concurrency (version checks) instead of explicit row locks where conflicts are actually rare.
- **Handle the deadlock error as an expected, retryable failure** — even with good discipline, a deadlock can still occasionally happen under concurrent load; the code calling the transaction should catch that specific error and retry, not treat it as a fatal bug.

**Interview line:** *"A deadlock is two transactions each holding a lock the other one needs, so neither can proceed. The main prevention is discipline — always acquire locks in the same order everywhere in the codebase, so two transactions can't form a cycle — plus keeping transactions short. Even with that, I treat a deadlock error as an expected, retryable failure rather than something that should never happen."*

**Tests:** deadlock mechanics, prevention discipline

*Axis: concurrency · Source: challenge question*

---

### "When should you use transactions?"

Whenever multiple writes need to succeed or fail **together** — if any one of them can't happen, none of them should be visible to anyone else. The classic test: "if the server crashed right after write #1 but before write #2, would the database be in a broken/inconsistent state?" If yes, they belong in a transaction.

Examples: debit one account and credit another (a partial transfer is a real bug); create an order *and* decrement inventory (an order with no corresponding inventory decrement is a real bug); insert a parent row and its child rows together.

What *doesn't* need a transaction: a single independent write (already atomic by itself at the row level), or a sequence of writes that are genuinely fine to leave partially applied (e.g. writing to an analytics/logging table — losing one log entry on a crash isn't a correctness bug).

**Interview line:** *"My test is: if the process crashed between two writes, would the database be left in a state that's actually broken, not just incomplete? If yes, they need to be in the same transaction — a debit and credit, an order and its inventory decrement. A single independent write, or writes where partial completion is genuinely harmless, don't need one."*

**Tests:** transaction boundary judgment

*Axis: consistency · Source: challenge question*

---

### "What happens if a transaction partially fails?"

The database's own guarantee (atomicity) means it can't happen *inside* a single transaction against one database — if step 3 fails, the whole transaction rolls back, and steps 1-2 are undone too. The application never sees a half-applied transaction; it just sees the whole thing fail, and it needs to handle that failure (retry, surface an error, whatever's appropriate).

The real "partial failure" risk shows up **outside** a single database transaction — a multi-step process that mixes a database write with a call to an external system (charge a card via a payment API, *then* write the order to the database) has no such atomicity guarantee across the two. If the database write fails after the external call already succeeded, you now have a real partial failure with no automatic rollback — which is exactly the problem the **outbox pattern** and **Saga pattern** (see [`01-distributed-systems-reliability/consistency-and-transactions.md`](../01-distributed-systems-reliability/consistency-and-transactions.md)) exist to handle.

**Interview line:** *"Inside one database, a transaction can't actually 'partially fail' from the application's perspective — atomicity means the whole thing rolls back and I just see one failure to handle. The real partial-failure risk is a process that spans a database write and an external call, like charging a card and then writing the order — those aren't atomic together, and that's exactly the gap the outbox and Saga patterns exist to close."*

**Tests:** transaction boundaries, distributed vs local atomicity

*Axis: failure · Source: challenge question*

---
