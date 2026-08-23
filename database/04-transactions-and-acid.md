# Database Study Notes — Part 04

## Transactions & ACID

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [ACID, with a concrete example per letter](#acid)
2. [`COMMIT` / `ROLLBACK`](#commit-rollback)
3. [Isolation levels](#isolation)
4. [Dirty read / phantom read / non-repeatable read](#anomalies)
5. [Why use a transaction — the money-transfer example](#why)
6. [Interview Questions & Answers](#interview)
7. [Cheat Sheet](#cheatsheet)

---

<a name="acid"></a>
## 1. ACID, with a concrete example per letter

| Letter | Guarantee | Concrete example |
|---|---|---|
| **Atomicity** | all operations in a transaction succeed, or none do | transferring money: debit account A and credit account B either both happen or neither does — never just the debit |
| **Consistency** | a transaction moves the database from one valid state to another, respecting all constraints | a `CHECK` constraint that balance can't go negative — a transaction that would violate it is rejected, not partially applied |
| **Isolation** | concurrent transactions don't see each other's uncommitted changes | two people booking the last seat simultaneously don't both succeed — isolation prevents one from seeing the other's in-flight change |
| **Durability** | once committed, data survives a crash | after the transfer commits and the app gets a success response, a server crash one second later doesn't lose that transfer |

---

<a name="commit-rollback"></a>
## 2. `COMMIT` / `ROLLBACK`

```sql
BEGIN TRANSACTION;

UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- if both succeeded and constraints hold:
COMMIT;

-- if anything failed (insufficient balance, constraint violation, app-level error):
ROLLBACK;
```

`COMMIT` makes all changes in the transaction permanent and visible to other transactions. `ROLLBACK` discards every change made since `BEGIN`, as if none of it happened — this is what makes atomicity actually enforceable at the application level: catch the error, call `ROLLBACK`, and the partial debit never happened.

---

<a name="isolation"></a>
## 3. Isolation levels

From weakest (fastest, most anomalies possible) to strongest (slowest, fewest anomalies):

| Level | Prevents | Still allows |
|---|---|---|
| **Read Uncommitted** | nothing | dirty reads, non-repeatable reads, phantom reads |
| **Read Committed** | dirty reads | non-repeatable reads, phantom reads |
| **Repeatable Read** | dirty reads, non-repeatable reads | phantom reads (mostly — MySQL's InnoDB actually prevents most phantoms here too, a known engine-specific deviation from the standard) |
| **Serializable** | all three | — (transactions behave as if run one at a time) |

**The trade-off:** stronger isolation = more locking/blocking = lower concurrency throughput. Most applications default to **Read Committed** (Postgres, Oracle) or **Repeatable Read** (MySQL/InnoDB) — `Serializable` is reserved for genuinely correctness-critical sections, not used as a blanket default, because of the throughput cost.

---

<a name="anomalies"></a>
## 4. Dirty read / phantom read / non-repeatable read

- **Dirty read:** transaction A reads a row that transaction B has modified but **not yet committed** — if B rolls back, A read data that never actually existed.
- **Non-repeatable read:** transaction A reads the same row twice, and gets **different values** because transaction B committed an update to it in between.
- **Phantom read:** transaction A runs the same query twice, and the **set of rows** changes (new rows appear or existing ones vanish) because transaction B inserted/deleted rows matching the query in between — the difference from non-repeatable read is *row count/membership* changing, not a single row's *values* changing.

```
T1: SELECT balance FROM accounts WHERE id = 1;   -- reads 500
T2: UPDATE accounts SET balance = 400 WHERE id = 1; COMMIT;
T1: SELECT balance FROM accounts WHERE id = 1;   -- reads 400  ← non-repeatable read
```

---

<a name="why"></a>
## 5. Why use a transaction — the money-transfer example, and what breaks without one

Transferring 100 from account A to B is **two separate statements** — debit A, credit B. Without a transaction wrapping both:

- If the app crashes, the network drops, or the second statement fails **after the debit but before the credit**, A has lost 100 and B never received it — money has vanished from the system with no record of where it went.
- With `BEGIN...COMMIT`/`ROLLBACK` wrapping both, that failure state is impossible: either both statements land, or neither does. There is no observable in-between state.

**Use a transaction whenever multiple writes must succeed or fail together as one logical unit** — not for single-statement operations, which are already atomic on their own.

---

<a name="interview"></a>
## 6. Interview Questions & Answers

**Q: Explain ACID with a concrete example per letter.**
A: (see the table in §1 — lead with the money-transfer example for Atomicity since it's the one everyone reaches for, but be ready with the seat-booking example for Isolation too).

**Q: Why would you use a transaction — walk through what breaks without one?**
A: Any operation that's really multiple writes that need to succeed or fail together — money transfer is the classic case. Without a transaction, a crash between the debit and the credit leaves the system in an impossible state: money gone from one account, never credited to the other, no record of where it went. A transaction guarantees there's no observable in-between state.

**Q: What does a dirty read actually look like in practice?**
A: Transaction A reads a value transaction B changed but hasn't committed yet. If B then rolls back, A made a decision based on data that, from the database's permanent history, never actually existed — e.g. approving a withdrawal based on an uncommitted balance update that later gets reversed.

**Q: What's the difference between a non-repeatable read and a phantom read?**
A: Non-repeatable read = the same row's *value* changes between two reads in one transaction. Phantom read = the *set of rows* matching a query changes between two reads (rows appear/disappear), not just one row's value.

---

<a name="cheatsheet"></a>
## 7. Cheat Sheet

- **A**tomicity = all-or-nothing. **C**onsistency = valid-state-to-valid-state. **I**solation = concurrent transactions don't see each other's uncommitted work. **D**urability = committed = survives a crash.
- `COMMIT` makes changes permanent; `ROLLBACK` discards everything since `BEGIN`.
- Isolation levels, weakest→strongest: Read Uncommitted → Read Committed → Repeatable Read → Serializable. Stronger = fewer anomalies, more locking cost.
- Dirty read = read uncommitted data. Non-repeatable read = same row, different value on re-read. Phantom read = different *set* of rows on re-read.
- Use a transaction when multiple writes must succeed/fail together as one unit — not for standalone single statements.
- **See also:** [Part 04.5](04.5-foreign-keys-and-cascading.md) for foreign keys/cascading (the other database-enforced integrity mechanism), and [Part 15](15-mongodb-transactions-and-concurrency.md) for how MongoDB's transaction model differs. Full SQL vs NoSQL comparison → [Part 20](20-sql-vs-nosql-comparison.md).
