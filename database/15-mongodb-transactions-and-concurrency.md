# Database Study Notes — Part 15

## MongoDB Transactions & Concurrency

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Multi-document ACID transactions in MongoDB](#transactions)
2. [Optimistic vs pessimistic locking](#locking)
3. [MVCC, the general concept](#mvcc)
4. [Preventing inventory going below zero under concurrency](#inventory)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="transactions"></a>
## 1. Multi-document ACID transactions in MongoDB

MongoDB **does** support multi-document ACID transactions (since v4.0), with the same `BEGIN`/`COMMIT`/`ROLLBACK`-shaped guarantees as Part 04's SQL transactions:

```js
const session = client.startSession();
session.startTransaction();
try {
  await Account.updateOne({ _id: a }, { $inc: { balance: -100 } }, { session });
  await Account.updateOne({ _id: b }, { $inc: { balance: 100 } }, { session });
  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction();
} finally {
  session.endSession();
}
```

**But it's a heavier tool here than in a relational database, on purpose.** Because MongoDB's whole schema-design philosophy (Part 09) already leans toward **embedding** related data into a single document specifically so that many logically-related updates can be a single-document write — and a single-document write in MongoDB is *already* atomic without needing an explicit transaction at all. The natural first move when you find yourself reaching for a multi-document transaction is to ask whether the data model should have embedded that relationship instead — transactions are the fallback for genuinely cross-document consistency needs, not the default tool for "these things must update together."

---

<a name="locking"></a>
## 2. Optimistic vs pessimistic locking

- **Pessimistic locking:** acquire a lock on the row/document **before** reading or modifying it; any other transaction wanting the same row **blocks** until the lock is released. Guarantees no conflict can happen, at the cost of concurrency — other requests wait.
- **Optimistic locking:** don't lock anything upfront. Read the data along with a **version number**, do the work, then write back **conditionally on the version being unchanged**. If another process modified it in between, the version won't match, the write is rejected, and the caller retries.

```js
// Optimistic locking with a version field
const doc = await Product.findById(id);           // doc.version = 5
// ... do work with doc.stock ...
const result = await Product.updateOne(
  { _id: id, version: 5 },                         // only succeeds if version is still 5
  { $set: { stock: doc.stock - 1 }, $inc: { version: 1 } }
);
if (result.matchedCount === 0) { /* someone else updated it first — retry */ }
```

**When each wins:** pessimistic locking wins under **high contention** (many concurrent writers to the same row) — retrying optimistic writes over and over under heavy contention wastes more work than just waiting for a lock. Optimistic locking wins under **low contention** (conflicts are rare) — most of the time there's no actual conflict, so paying zero locking cost on the common path is a clear win, and the occasional retry is cheap.

---

<a name="mvcc"></a>
## 3. MVCC, the general concept

**Multi-Version Concurrency Control** is the mechanism underneath "readers don't block writers, writers don't block readers" in most modern databases. Instead of one single shared copy of a row that reads and writes fight over, the database keeps **multiple versions** of a row as it's modified — a read sees a consistent snapshot of the data as of when its transaction started, while a concurrent write creates a **new version** rather than mutating the one being read. Readers never need to wait for a writer to finish, because they're reading an older, still-valid version, not the one currently being written.

This is *why* Read Committed / Repeatable Read isolation levels (Part 04) can offer strong-ish guarantees without the heavy locking that would otherwise be required — MVCC gives isolation largely "for free" for reads.

---

<a name="inventory"></a>
## 4. Preventing two concurrent requests from decrementing inventory below zero

The naive approach — read the stock count, check it's `> 0` in application code, then write the decrement — has a race condition: two concurrent requests can both read `stock: 1`, both see it's `> 0`, and both decrement, leaving `stock: -1`.

**The fix: push the check into the same atomic operation as the write**, so there's no gap between reading and writing for a race to occur in:

```js
// Atomic, race-free — the condition and the decrement happen as one operation
const result = await Product.updateOne(
  { _id: id, stock: { $gt: 0 } },     // condition checked as part of the same atomic write
  { $inc: { stock: -1 } }
);
if (result.matchedCount === 0) {
  // stock was already 0 — this specific request correctly fails, no oversell possible
}
```

This works because MongoDB guarantees **single-document operations are atomic** — the `$gt: 0` filter and the `$inc` happen as one indivisible step from the database's perspective, so there's no window where a second concurrent request can slip in between the check and the write.

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: How would you prevent two concurrent requests from both decrementing the same inventory count below zero?**
A: Don't check-then-write in application code (read stock, check `>0`, then decrement) — that has a race window. Instead push the condition into the same atomic update: `updateOne({_id, stock: {$gt: 0}}, {$inc: {stock: -1}})`. MongoDB guarantees single-document operations are atomic, so the check and the write can't be interleaved by a concurrent request.

**Q: Optimistic vs pessimistic locking — give a scenario where each wins.**
A: Pessimistic locking wins under high contention — many concurrent writers to the same record, where retrying failed optimistic writes over and over would waste more work than just blocking and waiting. Optimistic locking wins under low contention — conflicts are rare, so most writes succeed with zero locking overhead on the common path, and the occasional retry on an actual conflict is cheap.

**Q: Why is a multi-document transaction considered a heavier tool in MongoDB than in a relational database?**
A: Because MongoDB's schema design already favors embedding related data into a single document specifically so related updates can be one atomic single-document write — which is already atomic without a transaction. Reaching for a multi-document transaction is often a signal to first reconsider whether the data model should have embedded that relationship, rather than the default tool for "these things must update together."

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- Multi-document transactions exist in MongoDB (v4.0+) but are a heavier fallback — good schema design often avoids needing them by embedding data so a single-document write covers the "update together" case, which is atomic by default.
- Pessimistic locking = lock upfront, others block — wins under high contention.
- Optimistic locking = version field, write conditionally, retry on mismatch — wins under low contention.
- MVCC = multiple versions of a row kept as it's modified, so readers see a consistent snapshot without blocking writers, and vice versa.
- Inventory-below-zero fix: put the `stock > 0` condition inside the same atomic `updateOne` as the decrement — never check-then-write as two separate steps.
- **SQL vs NoSQL:** SQL is ACID-by-default on every statement ([Part 04](04-transactions-and-acid.md)); Mongo is atomic-per-document by default, with multi-document transactions as a heavier fallback rather than the baseline. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
