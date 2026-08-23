# Database Study Notes — Part 06

## MongoDB Indexes

> **Format:** Q&A — my prompts are the questions, the explanations are the answers.

---

## Table of Contents

1. [Index types](#types)
2. [Hands-on: "10 million users, searching by email is slow"](#hands-on)
3. [Compound index field order](#order)
4. [Covered queries](#covered)
5. [Interview Questions & Answers](#interview)
6. [Cheat Sheet](#cheatsheet)

---

<a name="types"></a>
## 1. Index types

```js
db.users.createIndex({ email: 1 })                          // single-field
db.orders.createIndex({ customerId: 1, createdAt: -1 })      // compound
db.articles.createIndex({ title: "text", body: "text" })     // text index
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })  // TTL — auto-deletes after 1hr
```

- **Single-field** — the basic case, same B-Tree concept as SQL (Part 02).
- **Compound** — same left-most-prefix logic as SQL composite indexes: an index on `{customerId: 1, createdAt: -1}` serves queries filtering on `customerId` alone or `customerId` + `createdAt`, not `createdAt` alone.
- **Text index** — supports full-text search (`$text` queries) instead of exact-match/range lookups; only one text index allowed per collection.
- **TTL index** — documents are automatically deleted once `expireAfterSeconds` has passed since the indexed date field. The go-to mechanism for session data, verification codes, or any record that should self-expire without a manual cleanup job.

---

<a name="hands-on"></a>
## 2. Hands-on: "10 million users, searching by email is slow"

The scenario, walked as a chain — this is the shape interviewers actually expect:

1. **Why slow?** — no index on `email`, so every lookup is a full collection scan across 10M documents.
2. **Confirm it** — `db.users.find({ email: "a@x.com" }).explain()`, check for `"stage": "COLLSCAN"`.
3. **Fix it** — `db.users.createIndex({ email: 1 })`.
4. **Does it need to be unique?** — if email is meant to be a unique identifier, `{ unique: true }` also enforces the constraint at the database level, not just the application level.
5. **Why not just add 20 indexes on everything, then?** — because every index costs write throughput (each insert/update now maintains N index structures instead of one), storage (each index is its own data structure on disk), and memory (indexes the working set relies on need to fit in RAM to stay fast). Indexing is a deliberate trade-off made per real query pattern, not a default reflex applied to every field.

---

<a name="order"></a>
## 3. Compound index field order

Identical logic to SQL (Part 02 §3): the index is physically sorted by the first field, then the second within each first-field value.

```js
db.orders.createIndex({ customerId: 1, status: 1 })

db.orders.find({ customerId: "abc" })                          // ✅ uses index
db.orders.find({ customerId: "abc", status: "shipped" })       // ✅ uses index
db.orders.find({ status: "shipped" })                           // ❌ can't use this index
```

Put the field with equality filters and higher selectivity first — the same reasoning as SQL, just applied to Mongo's syntax.

---

<a name="covered"></a>
## 4. Covered queries

A query is a "covered query" when **every field it needs — both the filter and the projection — exists in the index**, so MongoDB never has to fetch the actual document from disk.

```js
db.users.createIndex({ email: 1, name: 1 })

// covered — email (filter) and name (projection) are both in the index,
// and _id is explicitly excluded (it's included by default otherwise, breaking coverage)
db.users.find({ email: "a@x.com" }, { name: 1, _id: 0 })
```

The `_id: 0` matters here — MongoDB includes `_id` in the result by default, and `_id` isn't part of this index, so leaving it in would force a document fetch and break the covered-query optimization.

---

<a name="interview"></a>
## 5. Interview Questions & Answers

**Q: Why does compound index field order matter?**
A: The index is physically sorted by the first field, then the second within it — same left-most-prefix rule as a SQL composite index. A query can only use the index if it filters on a left-most prefix of the indexed fields.

**Q: What's a covered query?**
A: One where every field the query needs — for both filtering and projecting — is present in the index itself, so MongoDB answers it entirely from the index without touching the actual document. Requires explicitly excluding `_id` in the projection if `_id` isn't part of the index, since it's included by default otherwise.

**Q: Walk through diagnosing "search by email is slow at 10M users."**
A: Confirm with `.explain()` that it's a `COLLSCAN`, add a single-field index on `email`, consider `unique: true` if email should be a real identifier — but don't stop there: justify why you're not just indexing every field, since each index has a real write-throughput, storage, and memory cost.

---

<a name="cheatsheet"></a>
## 6. Cheat Sheet

- Index types: single-field, compound (left-most-prefix rule applies), text (`$text` search, one per collection), TTL (`expireAfterSeconds`, auto-deletes documents).
- `.explain()` → `COLLSCAN` = full scan, no index used. Diagnose before assuming.
- Compound index field order: most selective / most-filtered-on field first.
- Covered query = filter + projected fields all inside the index; exclude `_id` explicitly if it's not indexed.
- Every index costs write throughput + storage + RAM — index deliberately, not exhaustively.
- **SQL vs NoSQL:** same B-Tree/left-most-prefix concepts as [SQL indexes (Part 02)](02-sql-indexes.md) — Mongo adds TTL and text indexes with no direct SQL equivalent. Full comparison → [Part 20](20-sql-vs-nosql-comparison.md).
